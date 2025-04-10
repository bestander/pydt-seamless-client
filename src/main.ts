import { app, Tray, Menu, nativeImage, BrowserWindow, ipcMain, shell, Notification } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { createCanvas } from 'canvas';
import { pydtApi, PYDTGame, SteamProfile, TurnInfo } from './api';
import { addUser, getStore, refreshUserData } from './account';
import * as os from 'os';
import * as https from 'https';
import * as zlib from 'zlib';
import * as chokidar from 'chokidar';
import { openLogWindow, initializeLogger } from './logger';

let tray: Tray | null = null;
let pollInterval: NodeJS.Timeout | null = null;
let downloadedTurns: { [gameId: string]: boolean } = {};
let watchedGames: { [gameId: string]: { 
  watcher: chokidar.FSWatcher,
  saveDir: string,
  token: string,
  username: string,
  processedFiles: Set<string>
}} = {};
let userStateCache: { [token: string]: UserState } = {};
let steamProfilesCache: { [steamId: string]: SteamProfile } = {};
let steamProfilesCacheExpiry: number = 0;
const STEAM_PROFILES_CACHE_DURATION = 180 * 60 * 1000; // 180 minutes in milliseconds

// Add a variable to track the current update promise
let currentTrayUpdatePromise: Promise<void> | null = null;

interface UserState {
  username: string;
  pollUrl: string | null;
  steamId: string | null;
}

function createTrayIcon(isMyTurn: boolean = false, isWatching: boolean = false) {
  const size = 16;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Draw background
  if (isWatching) {
    ctx.fillStyle = '#FFD700'; // Golden-yellow for watching
  } else if (isMyTurn) {
    ctx.fillStyle = '#ff0000'; // Red if my turn
  } else {
    ctx.fillStyle = '#006400'; // Dark green if not
  }
  ctx.fillRect(0, 0, size, size);

  // Draw text
  ctx.fillStyle = '#ffffff'; // White text
  ctx.font = 'bold 10px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VI', size/2, size/2);

  // Save to file
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(iconPath, buffer);
  
  return iconPath;
}

function createTray() {
  try {
    // Create and save the icon
    const iconPath = createTrayIcon();
    
    // Create the tray with the icon
    tray = new Tray(iconPath);
    tray.setToolTip('PYDT Super Client');
    
    console.log('Tray created successfully');
  } catch (error) {
    console.error('Error creating tray:', error);
  }
}

async function submitTurn(game: PYDTGame, username: string, token: string, filePath: string) {
  try {

    // Check if it's our turn using the cached user data
    if (game.currentPlayerSteamId !== userStateCache[token].steamId) {
      console.log(`Not my turn for game ${game.displayName}`);
      return false;
    }

    console.log(`Starting turn submission for game ${game.displayName}`);
    
    // Start the turn submission process
    const startResponse = await pydtApi.startTurnSubmit(token, game.gameId);
    console.log('Start turn submit response:', startResponse);

    // Read the file and compress it
    const fileBuffer = fs.readFileSync(filePath);
    const compressedBuffer = zlib.gzipSync(fileBuffer);


    await fetch(startResponse.putUrl, {
      method: 'PUT',
      body: compressedBuffer,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'gzip'
      }
    });
    
    // Finish the turn submission
    const finishResponse = await pydtApi.finishTurnSubmit(token, game.gameId);
    console.log('Finish turn submit response:', finishResponse);
    updateTrayMenu();
    
    return true;
  } catch (error: any) {
    console.error('Error submitting turn:', error);
    console.error(`Error details: ${error.message || 'Unknown error'}`);
    console.error(`Error stack: ${error.stack || 'No stack trace'}`);
    return false;
  }
}

function startWatchingGame(game: PYDTGame, username: string, token: string) {
  // Determine the save directory based on OS
  let saveDir = '';
  if (process.platform === 'darwin') {
    saveDir = path.join(os.homedir(), 'Library', 'Application Support', 'Sid Meier\'s Civilization VI', 'Sid Meier\'s Civilization VI', 'Saves', 'Hotseat');
  } else if (process.platform === 'win32') {
    saveDir = path.join(os.homedir(), 'Documents', 'My Games', 'Sid Meier\'s Civilization VI', 'Saves', 'Hotseat');
  } else {
    console.error('Unsupported platform for watching turns');
    return;
  }

  // Stop any existing watchers before starting a new one
  for (const [gameId, gameInfo] of Object.entries(watchedGames)) {
    console.log(`Stopping watcher for game ${gameId}`);
    gameInfo.watcher.close();
    delete watchedGames[gameId];
  }
  // Update the menu to remove all hourglasses
  updateTrayMenu();

  // Get the current list of files in the directory
  const existingFiles = new Set<string>();
  if (fs.existsSync(saveDir)) {
    const files = fs.readdirSync(saveDir);
    files.forEach(file => {
      if (file.endsWith('.Civ6Save')) {
        existingFiles.add(path.join(saveDir, file));
      }
    });
  }

  // Create a watcher for the save directory
  const watcher = chokidar.watch(saveDir, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true, // Don't trigger on initial scan
    awaitWriteFinish: {
      stabilityThreshold: 2000, // Wait 2 seconds after the last write
      pollInterval: 100 // Check every 100ms
    }
  });

  // Store the watcher and related info
  watchedGames[game.gameId] = {
    watcher,
    saveDir,
    token,
    username,
    processedFiles: existingFiles // Initialize with existing files
  };

  console.log(`Started watching for new save files in ${saveDir}`);
  console.log(`Existing files: ${Array.from(existingFiles).join(', ')}`);

  // Watch for new files
  watcher.on('add', async (filePath: string) => {
    // Check if the file is a Civilization VI save file and hasn't been processed yet
    if (filePath.endsWith('.Civ6Save') && !watchedGames[game.gameId].processedFiles.has(filePath)) {
      // Mark this file as processed to prevent duplicate uploads
      watchedGames[game.gameId].processedFiles.add(filePath);
      
      console.log(`Processing new save file: ${filePath}`);
      
      // Wait a moment to ensure the file is fully written
      setTimeout(async () => {
        try {
          const success = await submitTurn(game, username, token, filePath);
          if (success) {
            // Stop watching after successful submission
            watcher.close();
            delete watchedGames[game.gameId];
            // Update the tray menu to remove the hourglass
            updateTrayMenu();
          }
        } catch (error) {
          console.error(`Error processing file ${filePath}:`, error);
        }
      }, 1000);
    }
  });
}

async function downloadTurn(game: PYDTGame, username: string, token: string): Promise<boolean> {
  try {
    // Get the turn URL
    const turnInfo = await pydtApi.getTurnUrl(token, game.gameId);
    console.log('Turn info:', turnInfo);
    
    // Create the filename (without .gz extension)
    const sanitizedGameName = game.displayName.replace(/[<>:"/\\|?*]/g, '_');
    const filename = `!PYDT-${sanitizedGameName}-${username}.Civ6Save`;
    
    // Determine the save directory based on OS
    let saveDir = '';
    if (process.platform === 'darwin') {
      saveDir = path.join(os.homedir(), 'Library', 'Application Support', 'Sid Meier\'s Civilization VI', 'Sid Meier\'s Civilization VI', 'Saves', 'Hotseat');
    } else if (process.platform === 'win32') {
      saveDir = path.join(os.homedir(), 'Documents', 'My Games', 'Sid Meier\'s Civilization VI', 'Saves', 'Hotseat');
    } else {
      console.error('Unsupported platform for saving turns');
      return false;
    }
    
    // Create the directory if it doesn't exist
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }
    
    const filePath = path.join(saveDir, filename);
    
    // Download and decompress the file
    return new Promise<boolean>((resolve, reject) => {
      const file = fs.createWriteStream(filePath);
      
      https.get(turnInfo.downloadUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download turn: ${response.statusCode} ${response.statusMessage}`));
          return;
        }
        
        // Pipe through gunzip to decompress
        response.pipe(zlib.createGunzip()).pipe(file);
        
        file.on('finish', () => {
          file.close();
          console.log(`Turn downloaded and decompressed successfully: ${filePath}`);
          downloadedTurns[game.gameId] = true;
          startWatchingGame(game, username, token);
          resolve(true);
        });
      }).on('error', (err) => {
        fs.unlink(filePath, () => {}); // Delete the file if there was an error
        reject(err);
      });
      
      file.on('error', (err) => {
        fs.unlink(filePath, () => {}); // Delete the file if there was an error
        reject(err);
      });
    });
  } catch (error) {
    console.error(`Error downloading turn for game ${game.gameId}:`, error);
    return false;
  }
}

// Helper function to update poll URL in cache
function updatePollUrlCache(token: string, pollUrl: string | null) {
  if (pollUrl) {
    userStateCache[token] = {
      ...userStateCache[token],
      pollUrl
    };
    console.log(`Updated poll URL cache: ${pollUrl}`);
  }
}

async function updateTrayMenu() {
  if (!tray) {
    console.error('Tray is null, cannot update menu');
    return;
  }

  // If there's already an update in progress, wait for it to complete
  if (currentTrayUpdatePromise) {
    console.log('Tray update already in progress, waiting for it to complete...');
    await currentTrayUpdatePromise;
    return;
  }

  // Create a new promise for this update
  currentTrayUpdatePromise = (async () => {
    try {
      const tokens = getStore().get('tokens') as { [key: string]: string };
      console.log(`Tokens: ${JSON.stringify(tokens)}`);
      const allGames: PYDTGame[] = [];
      const myTurnGames: { [gameId: string]: { game: PYDTGame, username: string, token: string } } = {};
      let playerProfiles: { [steamId: string]: SteamProfile } = {};

      // First, fetch all user data upfront to avoid duplicate calls
      const userDataPromises = Object.entries(tokens).map(async ([username, token]) => {
        try {
          // Check if we have cached user data
          if (!userStateCache[token]) {
            const userData = await pydtApi.getUserData(token);
            userStateCache[token] = {
              username,
              pollUrl: null,
              steamId: userData.steamId
            };
            console.log(`Fetched user data for ${username}`);
          } else {
            console.log(`Using cached user data for ${username}`);
          }
          return { username, token, userData: userStateCache[token] };
        } catch (error: any) {
          console.error(`Error fetching user data for ${username}:`, error);
          console.error(`Error details: ${error.message || 'Unknown error'}`);
          console.error(`Error stack: ${error.stack || 'No stack trace'}`);
        }
      });

      const userDataResults = await Promise.all(userDataPromises);
      const userDataMap = userDataResults.reduce((acc, result) => {
        if (result && result.userData) {
          acc[result.token] = result.userData;
        }
        return acc;
      }, {} as { [token: string]: UserState });

      // Now fetch games for each user
      for (const [username, token] of Object.entries(tokens)) {
        try {
          let games: PYDTGame[] = [];
          
          // Check if we have a poll URL for this user
          if (userStateCache[token]?.pollUrl) {
            console.log(`Using cached poll URL for ${username}: ${userStateCache[token].pollUrl}`);
            try {
              // Use the cached poll URL to get games
              const response = await fetch(userStateCache[token].pollUrl!);
              if (response.ok) {
                games = await response.json();
                console.log(`Fetched ${games.length} games from poll URL for ${username}`);
              } else {
                console.error(`Error fetching from poll URL for ${username}: ${response.status} ${response.statusText}`);
                // If poll URL fails, fall back to full games fetch
                throw new Error(`Poll URL request failed: ${response.status}`);
              }
            } catch (pollError: any) {
              console.error(`Error using poll URL for ${username}:`, pollError);
              // If poll URL fails, fall back to full games fetch
              console.log(`No poll URL available for ${username}, doing full games fetch`);
              const gamesData = await pydtApi.getGames(token);
              games = gamesData.data;
              
              // Update the poll URL cache if a new poll URL is returned
              if (games.length > 0 && gamesData.pollUrl) {
                updatePollUrlCache(token, gamesData.pollUrl);
              }
            }
          } else {
            // No cached poll URL, do a full games fetch
            console.log(`No poll URL available for ${username}, doing full games fetch`);
            const gamesData = await pydtApi.getGames(token);
            games = gamesData.data;
            
            // Update the poll URL cache if a poll URL is returned
            if (games.length > 0 && gamesData.pollUrl) {
              updatePollUrlCache(token, gamesData.pollUrl);
            }
          }

          // Add games to the collection, avoiding duplicates by gameId
          for (const game of games) {
            if (!allGames.some(g => g.gameId === game.gameId)) {
              allGames.push(game);
            }
            
            // Check if this is our turn using the cached user data
            try {
              const userData = userDataMap[token];
              if (userData && game.currentPlayerSteamId === userData.steamId) {
                myTurnGames[game.gameId] = { game, username, token };
              }
            } catch (error: any) {
              console.error(`Error checking if game ${game.gameId} is my turn:`, error);
              console.error(`Error details: ${error.message || 'Unknown error'}`);
              console.error(`Error stack: ${error.stack || 'No stack trace'}`);
              console.error(`userDataCache[token]:`, userDataMap[token]);
              console.error(`game.currentPlayerSteamId:`, game.currentPlayerSteamId);
            }
          }

          // Get unique steam IDs from all games
          const steamIds = [...new Set(games.flatMap(game => game.players.map(player => player.steamId)))];
          if (steamIds.length > 0) {
            // Check if we need to refresh the Steam profiles cache
            const now = Date.now();
            if (now > steamProfilesCacheExpiry) {
              // Cache expired, fetch new profiles
              try {
                const profiles = await pydtApi.getSteamProfiles(token, steamIds);
                steamProfilesCache = profiles.reduce((acc, profile) => {
                  acc[profile.steamid] = profile;
                  return acc;
                }, {} as { [steamId: string]: SteamProfile });
                steamProfilesCacheExpiry = now + STEAM_PROFILES_CACHE_DURATION;
                console.log('Steam profiles cache refreshed');
                updateSteamProfilesCacheInLogger();
              } catch (error: any) {
                console.error(`Error fetching Steam profiles:`, error);
                console.error(`Error details: ${error.message || 'Unknown error'}`);
                console.error(`Error stack: ${error.stack || 'No stack trace'}`);
              }
            }
            
            // Use cached profiles
            playerProfiles = {
              ...playerProfiles,
              ...steamProfilesCache
            };
          }
        } catch (error: any) {
          console.error(`Error fetching games for ${username}:`, error);
          console.error(`Error details: ${error.message || 'Unknown error'}`);
          console.error(`Error stack: ${error.stack || 'No stack trace'}`);
          
          // Try to get more information about the error
          if (error.response) {
            console.error(`Error response status: ${error.response.status}`);
            console.error(`Error response data:`, error.response.data);
          }
        }
      }

      // Check if any games are waiting for any of our profiles' turns
      let isMyTurn = false;
      for (const game of allGames) {
        for (const token of Object.values(tokens)) {
          const userData = userDataMap[token];
          if (userData && game.currentPlayerSteamId === userData.steamId) {
            isMyTurn = true;
            break;
          }
        }
        if (isMyTurn) break;
      }

      // Update tray icon based on turn status
      const isWatching = Object.keys(watchedGames).length > 0;
      const iconPath = createTrayIcon(isMyTurn, isWatching);
      tray.setImage(iconPath);

      // Create the games submenu
      const gamesSubmenu = allGames.length > 0 
        ? allGames.map(game => {
            const currentPlayer = playerProfiles[game.currentPlayerSteamId];
            const playerName = currentPlayer ? ` [${currentPlayer.personaname}]` : '';
            const myTurnInfo = myTurnGames[game.gameId];
            const isWatching = watchedGames[game.gameId] ? ' ⌛' : ''; // Add hourglass only for games being watched
            
            return {
              label: `${game.displayName}${playerName}${isWatching}`,
              click: async () => {
                if (myTurnInfo) {
                  // Check if this is a first turn
                  if (game.gameTurnRangeKey === 1) {
                    // For first turns, just start watching without downloading
                    startWatchingGame(myTurnInfo.game, myTurnInfo.username, myTurnInfo.token);
                  } else {
                    // For regular turns, download first
                    const success = await downloadTurn(myTurnInfo.game, myTurnInfo.username, myTurnInfo.token);
                    if (success) {
                      updateTrayMenu();
                    }
                  }
                } else {
                  // If it's not our turn, open the game in browser
                  shell.openExternal(`https://playyourdamnturn.com/game/${game.gameId}`);
                }
              }
            };
          })
        : [{
            label: 'No games available',
            enabled: false
          }];

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Games',
          submenu: gamesSubmenu
        },
        { type: 'separator' },
        {
          label: 'Open PYDT',
          click: () => {
            shell.openExternal('https://playyourdamnturn.com');
          }
        },
        {
          label: 'Manage Accounts',
          click: addUser
        },
        {
          label: 'Refresh All',
          click: async () => {
            // Clear the user data cache before refreshing
            userStateCache = {};
            for (const name of Object.keys(tokens)) {
              await refreshUserData(name);
            }
            updateTrayMenu();
          }
        },
        { type: 'separator' },
        {
          label: 'Open Log',
          click: () => {
            openLogWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            app.quit();
          }
        }
      ]);

      tray.setContextMenu(contextMenu);
      console.log('Menu updated successfully');
    } catch (error: any) {
      console.error('Error updating menu:', error);
      console.error(`Error details: ${error.message || 'Unknown error'}`);
      console.error(`Error stack: ${error.stack || 'No stack trace'}`);
      
      // Try to get more information about the error
      if (error.response) {
        console.error(`Error response status: ${error.response.status}`);
        console.error(`Error response data:`, error.response.data);
      }
    } finally {
      // Clear the current update promise when done
      currentTrayUpdatePromise = null;
    }
  })();

  // Return the promise so callers can await it if needed
  return currentTrayUpdatePromise;
}

// Start polling when the app is ready
app.whenReady().then(async () => {
  console.log('App is ready, creating tray...');
  createTray();
  
  // Initialize the logger
  initializeLogger();
  
  // Update the logger's cache with any existing steam profiles
  updateSteamProfilesCacheInLogger();
  
  // Start polling every minute
  pollInterval = setInterval(() => {
    updateTrayMenu();
  }, 60000); // 60 seconds
  
  // Initial update of the tray menu
  await updateTrayMenu();
});

// Handle window-all-closed event
app.on('window-all-closed', () => {
  console.log('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up polling when the app is quitting
app.on('before-quit', () => {
  console.log('App is quitting');
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  
  // Close all file watchers
  Object.values(watchedGames).forEach(({ watcher }) => {
    watcher.close();
  });
  watchedGames = {};
});

// Update the steamProfilesCache in the logger when it's updated in the app
function updateSteamProfilesCacheInLogger() {
  if ((global as any).updateSteamProfilesCache) {
    (global as any).updateSteamProfilesCache(steamProfilesCache);
    console.log('Steam profiles cache updated in logger:', Object.keys(steamProfilesCache).length, 'profiles');
    
    // Log the actual profiles for debugging - but don't use filterGameData here
    const profileList = Object.keys(steamProfilesCache).map(steamId => {
      const profile = steamProfilesCache[steamId];
      return `${steamId}: ${profile.personaname}`;
    });
    console.log('Steam profiles in cache:', profileList);
  } else {
    console.error('updateSteamProfilesCache function not found in global scope');
  }
} 