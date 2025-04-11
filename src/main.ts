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
let userDataCache: { [token: string]: any } = {};
let steamProfilesCache: { [steamId: string]: SteamProfile } = {};
let steamProfilesCacheExpiry: number = 0;
const STEAM_PROFILES_CACHE_DURATION = 180 * 60 * 1000; // 180 minutes in milliseconds

function createTrayIcon(isMyTurn: boolean = false) {
  const size = 16;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Draw background
  ctx.fillStyle = isMyTurn ? '#ff0000' : '#006400'; // Red if my turn, dark green if not
  ctx.fillRect(0, 0, size, size);

  // Draw "VI" text
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
    
    // Update the menu
    updateTrayMenu();
    
    console.log('Tray created successfully');
  } catch (error) {
    console.error('Error creating tray:', error);
  }
}

async function submitTurn(gameId: string, filePath: string, token: string): Promise<boolean> {
  try {
    // Set the token for API calls
    pydtApi.setToken(token);

    // Get the upload URL
    const submitResponse = await pydtApi.startTurnSubmit(gameId);
    
    // Read the file and compress it
    const fileBuffer = fs.readFileSync(filePath);
    const compressedBuffer = zlib.gzipSync(fileBuffer);

    // Upload the compressed file
    await fetch(submitResponse.putUrl, {
      method: 'PUT',
      body: compressedBuffer,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'gzip'
      }
    });

    try {
      // Finish the submission
      await pydtApi.finishTurnSubmit(gameId);
      console.log(`Turn submitted successfully for game ${gameId}`);
      return true;
    } catch (error: any) {
      console.error(`Error finishing turn submission for game ${gameId}:`, error);
      
      // Show notification for finishSubmit failure
      new Notification({
        title: 'Turn Submission Failed',
        body: `Failed to complete turn submission: ${error.message || 'Unknown error'}`
      }).show();
      
      return false;
    }
  } catch (error: any) {
    console.error(`Error submitting turn for game ${gameId}:`, error);
    
    // Show notification for general submission failure
    new Notification({
      title: 'Turn Submission Failed',
      body: `Failed to submit turn: ${error.message || 'Unknown error'}`
    }).show();
    
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

  // If we're already watching this game, stop watching it
  if (watchedGames[game.gameId]) {
    watchedGames[game.gameId].watcher.close();
  }

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
          const success = await submitTurn(game.gameId, filePath, token);
          if (success) {
            // Stop watching after successful submission
            watcher.close();
            delete watchedGames[game.gameId];
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
    pydtApi.setToken(token);
    const turnInfo = await pydtApi.getTurnUrl(game.gameId);
    
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

async function updateTrayMenu() {
  if (!tray) {
    console.error('Tray is null, cannot update menu');
    return;
  }

  try {
    const store = getStore();
    const tokens = store.get('tokens', {});
    
    // Fetch games for all profiles
    let allGames: PYDTGame[] = [];
    let playerProfiles: { [steamId: string]: SteamProfile } = {};
    let myTurnGames: { [gameId: string]: { game: PYDTGame, username: string, token: string } } = {};
    
    // Fetch games for each token
    for (const [username, token] of Object.entries(tokens)) {
      try {
        pydtApi.setToken(token);
        
        // If we have a poll URL, use it, otherwise do a full games fetch
        let games: PYDTGame[] = [];
        if (pollInterval === null) {
          const response = await pydtApi.getGames();
          console.log(`Raw response from getGames for ${username}:`, response);
          if (Array.isArray(response)) {
            games = response;
          } else if (response && typeof response === 'object' && 'data' in response && Array.isArray((response as any).data)) {
            games = (response as any).data;
          } else {
            console.error(`Unexpected response format from getGames for ${username}:`, response);
            continue;
          }
          console.log(`Fetched games for ${username}: ${games.map(g => g.displayName).join(', ')}`);
        } else {
          // Check if we have a poll URL before attempting to poll
          const hasPollUrl = pydtApi.hasPollUrl();
          if (hasPollUrl) {
            try {
              games = await pydtApi.pollGames();
              console.log(`Polled games for ${username}: ${games.map(g => g.displayName).join(', ')}`);
            } catch (error: any) {
              console.error(`Error polling games for ${username}:`, error);
              console.error(`Error details: ${error.message || 'Unknown error'}`);
              console.error(`Error stack: ${error.stack || 'No stack trace'}`);
              
              // If polling fails, fall back to full games fetch
              try {
                const response = await pydtApi.getGames();
                if (Array.isArray(response)) {
                  games = response;
                } else if (response && typeof response === 'object' && 'data' in response && Array.isArray((response as any).data)) {
                  games = (response as any).data;
                } else {
                  console.error(`Unexpected response format from getGames after poll error for ${username}`);
                  continue;
                }
                console.log(`Fetched games after poll error for ${username}: ${games.map(g => g.displayName).join(', ')}`);
              } catch (fallbackError: any) {
                console.error(`Error fetching games after poll error for ${username}:`, fallbackError);
                console.error(`Fallback error details: ${fallbackError.message || 'Unknown error'}`);
                continue;
              }
            }
          } else {
            // No poll URL available, do a full games fetch
            console.log(`No poll URL available for ${username}, doing full games fetch`);
            try {
              const response = await pydtApi.getGames();
              if (Array.isArray(response)) {
                games = response;
              } else if (response && typeof response === 'object' && 'data' in response && Array.isArray((response as any).data)) {
                games = (response as any).data;
              } else {
                console.error(`Unexpected response format from getGames for ${username}:`, response);
                continue;
              }
              console.log(`Fetched games for ${username}: ${games.map(g => g.displayName).join(', ')}`);
            } catch (error: any) {
              console.error(`Error fetching games for ${username}:`, error);
              console.error(`Error details: ${error.message || 'Unknown error'}`);
              console.error(`Error stack: ${error.stack || 'No stack trace'}`);
              
              // Try to get more information about the error
              if (error.response) {
                console.error(`Error response status: ${error.response.status}`);
                console.error(`Error response data:`, error.response.data);
              }
              
              continue;
            }
          }
        }
        
        // Add games to the collection, avoiding duplicates by gameId
        for (const game of games) {
          if (!allGames.some(g => g.gameId === game.gameId)) {
            allGames.push(game);
          }
          
          // Check if this is our turn
          // Only fetch user data if we don't have it cached
          if (!userDataCache[token]) {
            try {
              userDataCache[token] = await pydtApi.getUserData();
              console.log(`Fetched user data for ${username}`);
            } catch (error: any) {
              console.error(`Error fetching user data for ${username}:`, error);
              console.error(`Error details: ${error.message || 'Unknown error'}`);
              console.error(`Error stack: ${error.stack || 'No stack trace'}`);
              continue;
            }
          }
          
          try {
            if (game.currentPlayerSteamId === userDataCache[token].steamId) {
              myTurnGames[game.gameId] = { game, username, token };
            }
          } catch (error: any) {
            console.error(`Error checking if game ${game.gameId} is my turn:`, error);
            console.error(`Error details: ${error.message || 'Unknown error'}`);
            console.error(`Error stack: ${error.stack || 'No stack trace'}`);
            console.error(`userDataCache[token]:`, userDataCache[token]);
            console.error(`game.currentPlayerSteamId:`, game.currentPlayerSteamId);
          }
        }

        // Get unique steam IDs from all games
        const steamIds = [...new Set(games.map(game => game.currentPlayerSteamId))];
        if (steamIds.length > 0) {
          // Check if we need to refresh the Steam profiles cache
          const now = Date.now();
          if (now > steamProfilesCacheExpiry) {
            // Cache expired, fetch new profiles
            try {
              const profiles = await pydtApi.getSteamProfiles(steamIds);
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
        if (!userDataCache[token]) {
          try {
            pydtApi.setToken(token);
            userDataCache[token] = await pydtApi.getUserData();
          } catch (error: any) {
            console.error(`Error fetching user data for token:`, error);
            console.error(`Error details: ${error.message || 'Unknown error'}`);
            console.error(`Error stack: ${error.stack || 'No stack trace'}`);
            continue;
          }
        }
        
        try {
          if (game.currentPlayerSteamId === userDataCache[token].steamId) {
            isMyTurn = true;
            break;
          }
        } catch (error: any) {
          console.error(`Error checking if game ${game.gameId} is my turn:`, error);
          console.error(`Error details: ${error.message || 'Unknown error'}`);
          console.error(`Error stack: ${error.stack || 'No stack trace'}`);
          console.error(`userDataCache[token]:`, userDataCache[token]);
          console.error(`game.currentPlayerSteamId:`, game.currentPlayerSteamId);
        }
      }
      if (isMyTurn) break;
    }

    // Update tray icon based on turn status
    const iconPath = createTrayIcon(isMyTurn);
    tray.setImage(iconPath);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Games',
        submenu: [
          ...(allGames.length > 0 
            ? allGames.map(game => {
                const currentPlayer = playerProfiles[game.currentPlayerSteamId];
                const playerName = currentPlayer ? ` [${currentPlayer.personaname}]` : '';
                const isDownloaded = downloadedTurns[game.gameId] ? ' [PYDT]' : '';
                const myTurnInfo = myTurnGames[game.gameId];
                
                return {
                  label: `${game.displayName}${playerName}${isDownloaded}`,
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
              }]
          )
        ]
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
          userDataCache = {};
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
  }
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