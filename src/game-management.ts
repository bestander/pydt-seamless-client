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

  const userGamesData: { [username: string]: {displayName: string}[] } = {};

  for (const username of Object.keys(tokens)) {
    try {
      const token = tokens[username];
      const { data: userGames } = await fetchUserGames(token);
      userGamesData[username] = userGames.map(game => {
        console.log('Rendering game:', game); // Debug log to verify game structure
        return { displayName: game.displayName };
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
                  <button style="background: #ff4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Leave</button>
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
          select, button { padding: 8px; margin: 10px 0; }
          .section { margin: 15px 0; }
          .section-title { font-weight: bold; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        ${userSelector}
        <div class="section">
          <div class="section-title">Games</div>
          ${gamesList}
        </div>
        <button onclick="closePopup()">Close</button>
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
                          <button style="background: #ff4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Leave</button>
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
    height: 400,
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
