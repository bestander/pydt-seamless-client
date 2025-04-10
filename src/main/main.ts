import { app, Tray, Menu, nativeImage, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { createCanvas } from 'canvas';
import { pydtApi, PYDTGame, SteamProfile } from '../shared/api';
import { addUser, refreshUserData, getStore } from './accountManager';

let tray: Tray | null = null;
let pollInterval: NodeJS.Timeout | null = null;

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
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
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

async function updateTrayMenu() {
  if (!tray) {
    console.error('Tray is null, cannot update menu');
    return;
  }

  try {
    const store = getStore();
    const tokens = store.get('tokens', {});
    const selectedToken = store.get('selectedToken');

    // Fetch games if a token is selected
    let games: PYDTGame[] = [];
    let playerProfiles: { [steamId: string]: SteamProfile } = {};
    
    if (selectedToken && tokens[selectedToken]) {
      try {
        pydtApi.setToken(tokens[selectedToken]);
        
        // If we have a poll URL, use it, otherwise do a full games fetch
        if (pollInterval === null) {
          games = await pydtApi.getGames();
          console.log('Fetched games:', games);
        } else {
          try {
            games = await pydtApi.pollGames();
            console.log('Polled games:', games);
          } catch (error) {
            console.error('Error polling games:', error);
            // If polling fails, fall back to full games fetch
            games = await pydtApi.getGames();
            console.log('Fetched games after poll error:', games);
          }
        }

        // Get unique steam IDs from all games
        const steamIds = [...new Set(games.map(game => game.currentPlayerSteamId))];
        if (steamIds.length > 0) {
          const profiles = await pydtApi.getSteamProfiles(steamIds);
          playerProfiles = profiles.reduce((acc, profile) => {
            acc[profile.steamid] = profile;
            return acc;
          }, {} as { [steamId: string]: SteamProfile });
        }
      } catch (error) {
        console.error('Error fetching games:', error);
      }
    }

    // Check if any in-progress games are waiting for current user's turn
    const isMyTurn = games.some(game => 
      game.inProgress && 
      game.currentPlayerSteamId === selectedToken
    );

    // Update tray icon based on turn status
    const iconPath = createTrayIcon(isMyTurn);
    tray.setImage(iconPath);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Games',
        submenu: [
          ...(games.filter(game => game.inProgress).length > 0 
            ? games.filter(game => game.inProgress).map(game => {
                const currentPlayer = playerProfiles[game.currentPlayerSteamId];
                const playerName = currentPlayer ? ` [${currentPlayer.personaname}]` : '';
                return {
                  label: `${game.displayName}${playerName}`,
                  click: () => {
                    shell.openExternal(`https://playyourdamnturn.com/game/${game.gameId}`);
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
          for (const name of Object.keys(tokens)) {
            await refreshUserData(name);
          }
          updateTrayMenu();
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
  } catch (error) {
    console.error('Error updating menu:', error);
  }
}

// Start polling when the app is ready
app.whenReady().then(() => {
  console.log('App is ready, creating tray...');
  createTray();
  
  // Start polling every minute
  pollInterval = setInterval(() => {
    updateTrayMenu();
  }, 60000); // 60 seconds
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
}); 