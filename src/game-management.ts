import { BrowserWindow, ipcMain } from 'electron';
import { getStore } from './account';
import { pydtApi } from './api';

async function fetchUserGames(token: string) {
  try {
    const { data: userGames, pollUrl } = await pydtApi.getGames(token);
    console.log('Fetched user games:', userGames);
    console.log('Poll URL:', pollUrl);
    return { data: userGames, pollUrl };
  } catch (error) {
    console.error('Error fetching user games:', error);
    return { data: [], pollUrl: null };
  }
}

export async function manageGames(onGamesChange?: () => void): Promise<void> {
  const store = getStore();
  const tokens = store.get('tokens', {});
  const userCount = Object.keys(tokens).length;

  if (userCount === 0) {
    console.log('No users logged in, skipping manage games popup');
    return;
  }

  const userGamesData: { [username: string]: {displayName: string, gameId: string}[] } = {};

  for (const username of Object.keys(tokens)) {
    try {
      const token = tokens[username];
      const { data: userGames } = await fetchUserGames(token);
      userGamesData[username] = userGames.map(game => {
        console.log('Rendering game:', game); // Debug log to verify game structure
        return { displayName: game.displayName, gameId: game.gameId };
      });
    } catch (error) {
      console.error(`Error fetching games for user ${username}:`, error);
      userGamesData[username] = [];
    }
  }

  const userSelector = userCount > 1
    ? `
      <div class="section">
        <div class="section-title">Select User</div>
        <select id="userSelector">
          ${Object.keys(tokens).map(username => `<option value="${username}">${username}</option>`).join('')}
        </select>
      </div>
    `
    : '';

  // Get the first user for single user case
  const firstUser = Object.keys(tokens)[0];
  
  const gamesList = Object.keys(tokens).map(username => {
    const userGames = userGamesData[username] || [];
    const isVisible = userCount === 1 || username === firstUser;
    return `
      <div id="games-${username}" style="display: ${isVisible ? 'block' : 'none'};">
        ${userGames.length > 0
          ? userGames.map(game => {
              console.log('Rendering game in HTML:', game); // Debug log for HTML rendering
              return `
                <div style="display: flex; justify-content: space-between; align-items: center; margin: 5px 0; padding: 5px; background: #f5f5f5; border-radius: 4px;">
                  <span>${game.displayName}</span>
                  <button onclick="leaveGame('${game.gameId}', '${username}')" style="background: #ff4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Leave</button>
                </div>
              `;
            }).join('')
          : '<div style="color: #666;">No games available</div>'
        }
      </div>
    `;
  }).join('');

  const htmlContent = `
    <html>
      <head>
        <title>Manage Games</title>
        <style>
          body { font-family: system-ui; padding: 20px; }
          select, button, input { padding: 8px; margin: 5px 0; }
          input { width: calc(100% - 16px); }
          .section { margin: 15px 0; }
          .section-title { font-weight: bold; margin-bottom: 10px; }
          .join-section { border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px; }
          .button-group { margin-top: 10px; }
          .button-group button { margin-right: 8px; }
        </style>
      </head>
      <body>
        ${userSelector}
        <div class="section">
          <div class="section-title">Games</div>
          ${gamesList}
        </div>
        <div class="section join-section">
          <div class="section-title">Join Game</div>
          <input type="text" id="gameUrl" placeholder="Game URL or Game ID" />
          <input type="password" id="gamePassword" placeholder="Password (if required)" />
          <div class="button-group">
            <button onclick="joinGame()" style="background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">Join Game</button>
          </div>
        </div>
        <div class="button-group" style="margin-top: 20px; border-top: 1px solid #ddd; padding-top: 15px;">
          <button onclick="closePopup()">Close</button>
        </div>
        <script>
          const { ipcRenderer } = require('electron');

          // Set initial visibility for single user case
          document.addEventListener('DOMContentLoaded', () => {
            const userSelector = document.getElementById('userSelector');
            if (!userSelector) {
              // Single user case - show the first user's games
              const firstGamesDiv = document.querySelector('[id^="games-"]');
              if (firstGamesDiv) {
                firstGamesDiv.style.display = 'block';
              }
            }
          });

          function joinGame() {
            const userSelector = document.getElementById('userSelector');
            const selectedUser = userSelector ? userSelector.value : Object.keys(${JSON.stringify(Object.keys(tokens))})[0];
            const gameUrl = document.getElementById('gameUrl').value.trim();
            const gamePassword = document.getElementById('gamePassword').value;

            if (!gameUrl) {
              alert('Please enter a game URL or Game ID');
              return;
            }

            ipcRenderer.send('join-game', {
              username: selectedUser,
              gameUrl: gameUrl,
              password: gamePassword
            });
          }

          function leaveGame(gameId, username) {
            if (confirm('Are you sure you want to leave this game?')) {
              ipcRenderer.send('leave-game', {
                gameId: gameId,
                username: username
              });
            }
          }

          ipcRenderer.on('update-games', (event, userGamesData) => {
            console.log('Received updated games data:', userGamesData); // Debug log
            const userSelector = document.getElementById('userSelector');
            const selectedUser = userSelector?.value || Object.keys(userGamesData)[0];

            Object.keys(userGamesData).forEach(username => {
              const gamesContainer = document.getElementById('games-' + username);
              if (gamesContainer) {
                const userGames = userGamesData[username] || [];
                gamesContainer.innerHTML = userGames.length > 0
                  ? userGames.map(game => {
                      return \`
                        <div style="display: flex; justify-content: space-between; align-items: center; margin: 5px 0; padding: 5px; background: #f5f5f5; border-radius: 4px;">
                          <span>\${game.displayName}</span>
                          <button onclick="leaveGame('\${game.gameId}', '\${username}')" style="background: #ff4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Leave</button>
                        </div>
                      \`;
                    }).join('')
                  : '<div style="color: #666;">No games available</div>';
              }
            });

            // Show the selected user's games
            document.querySelectorAll('[id^="games-"]').forEach(el => el.style.display = 'none');
            const selectedGamesDiv = document.getElementById('games-' + selectedUser);
            if (selectedGamesDiv) {
              selectedGamesDiv.style.display = 'block';
            }
          });

          ipcRenderer.on('join-game-result', (event, result) => {
            if (result.success) {
              alert('Successfully joined the game!');
              // Clear the input fields
              document.getElementById('gameUrl').value = '';
              document.getElementById('gamePassword').value = '';
              // Request updated games data
              ipcRenderer.send('refresh-games');
            } else {
              alert('Failed to join game: ' + result.error);
            }
          });

          ipcRenderer.on('leave-game-result', (event, result) => {
            if (result.success) {
              alert('Successfully left the game!');
              // Request updated games data
              ipcRenderer.send('refresh-games');
            } else {
              alert('Failed to leave game: ' + result.error);
            }
          });

          document.getElementById('userSelector')?.addEventListener('change', (event) => {
            const selectedUser = event.target.value;
            document.querySelectorAll('[id^="games-"]').forEach(el => el.style.display = 'none');
            const selectedGamesDiv = document.getElementById('games-' + selectedUser);
            if (selectedGamesDiv) {
              selectedGamesDiv.style.display = 'block';
            }
          });

          function closePopup() {
            ipcRenderer.send('close-manage-games');
          }
        </script>
      </body>
    </html>
  `;

  const win = new BrowserWindow({
    width: 400,
    height: 500,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    frame: true,
    resizable: false
  });

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('update-games', userGamesData); // Send updated games data to the popup
  });

  ipcMain.once('join-game', async (_, data) => {
    try {
      const { username, gameUrl, password } = data;
      const token = tokens[username];
      
      if (!token) {
        win.webContents.send('join-game-result', { success: false, error: 'User token not found' });
        return;
      }

      // Extract game ID from URL if it's a full URL
      let gameId = gameUrl;
      // Check for PYDT URL format: https://www.playyourdamnturn.com/game/[gameId]
      const urlMatch = gameUrl.match(/\/game\/([a-f0-9-]+)$/i);
      if (urlMatch) {
        gameId = urlMatch[1];
      }

      // Join the game using the API
      await pydtApi.joinGame(token, gameId, password);
      
      win.webContents.send('join-game-result', { success: true });
      
      // Refresh games data
      const { data: updatedGames } = await fetchUserGames(token);
      userGamesData[username] = updatedGames.map(game => ({ displayName: game.displayName, gameId: game.gameId }));
      win.webContents.send('update-games', userGamesData);
      
    } catch (error: any) {
      console.error('Error joining game:', error);
      win.webContents.send('join-game-result', { 
        success: false, 
        error: error.message || 'Unknown error occurred' 
      });
    }
  });

  ipcMain.once('leave-game', async (_, data) => {
    try {
      const { gameId, username } = data;
      const token = tokens[username];
      
      if (!token) {
        win.webContents.send('leave-game-result', { success: false, error: 'User token not found' });
        return;
      }

      // Leave the game using the API
      await pydtApi.leaveGame(token, gameId);
      
      win.webContents.send('leave-game-result', { success: true });
      
      // Refresh games data
      const { data: updatedGames } = await fetchUserGames(token);
      userGamesData[username] = updatedGames.map(game => ({ displayName: game.displayName, gameId: game.gameId }));
      win.webContents.send('update-games', userGamesData);
      
    } catch (error: any) {
      console.error('Error leaving game:', error);
      win.webContents.send('leave-game-result', { 
        success: false, 
        error: error.message || 'Unknown error occurred' 
      });
    }
  });

  ipcMain.once('refresh-games', async () => {
    try {
      for (const username of Object.keys(tokens)) {
        const token = tokens[username];
        const { data: updatedGames } = await fetchUserGames(token);
        userGamesData[username] = updatedGames.map(game => ({ displayName: game.displayName, gameId: game.gameId }));
      }
      win.webContents.send('update-games', userGamesData);
    } catch (error) {
      console.error('Error refreshing games:', error);
    }
  });

  ipcMain.once('close-manage-games', () => {
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });

  win.on('closed', () => {
    if (onGamesChange) {
      onGamesChange();
    }
  });
}
