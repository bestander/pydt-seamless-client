import { app, Tray, Menu, nativeImage, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import Store from 'electron-store';

interface AppState {
  token?: string;
  selectedUser?: string;
  users: string[];
  games: string[];
}

const store = new Store<AppState>({
  defaults: {
    users: [],
    games: []
  }
});

let tray: Tray | null = null;

function createInputWindow(title: string, message: string): Promise<string | null> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 400,
      height: 200,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      frame: true,
      resizable: false
    });

    win.loadURL(`data:text/html;charset=utf-8,
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: system-ui; padding: 20px; }
            input { width: 100%; padding: 8px; margin: 10px 0; }
            button { padding: 8px 16px; margin-right: 8px; }
          </style>
        </head>
        <body>
          <h3>${message}</h3>
          <input type="text" id="input" />
          <br>
          <button onclick="submit()">OK</button>
          <button onclick="cancel()">Cancel</button>
          <script>
            function submit() {
              require('electron').ipcRenderer.send('input-response', document.getElementById('input').value);
            }
            function cancel() {
              require('electron').ipcRenderer.send('input-response', null);
            }
          </script>
        </body>
      </html>
    `);

    ipcMain.once('input-response', (_, value) => {
      win.close();
      resolve(value);
    });

    win.on('closed', () => {
      resolve(null);
    });
  });
}

function createTray() {
  try {
    // Create a simple blue square icon
    const size = 16;
    const icon = nativeImage.createEmpty();
    
    // Create a simple blue square
    const blueSquare = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
      0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60, 0x00, 0x00, 0x00,
      0x02, 0x00, 0x01, 0x4A, 0x90, 0xE2, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42,
      0x60, 0x82
    ]);
    
    const fallbackIcon = nativeImage.createFromBuffer(blueSquare);
    const resizedIcon = fallbackIcon.resize({ width: size, height: size });
    
    // Create the tray
    tray = new Tray(resizedIcon);
    console.log('Tray created successfully');
    
    // Set a tooltip
    tray.setToolTip('PYDT Super Client');
    
    // Update the menu
    updateTrayMenu();
  } catch (error) {
    console.error('Error creating tray:', error);
  }
}

async function addUser() {
  const result = await createInputWindow('Add User', 'Enter username:');
  if (result) {
    const users = store.get('users', []);
    if (!users.includes(result)) {
      users.push(result);
      store.set('users', users);
      updateTrayMenu();
    }
  }
}

async function addGame() {
  const result = await createInputWindow('Add Game', 'Enter game name:');
  if (result) {
    const games = store.get('games', []);
    if (!games.includes(result)) {
      games.push(result);
      store.set('games', games);
      updateTrayMenu();
    }
  }
}

function updateTrayMenu() {
  if (!tray) {
    console.error('Tray is null, cannot update menu');
    return;
  }

  try {
    const users = store.get('users', []);
    const games = store.get('games', []);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Users',
        submenu: [
          ...users.map(user => ({
            label: user,
            click: () => {
              store.set('selectedUser', user);
              updateTrayMenu();
            }
          })),
          { type: 'separator' },
          {
            label: 'Manage Users',
            click: addUser
          }
        ]
      },
      {
        label: 'Games',
        submenu: [
          ...games.map(game => ({
            label: game,
            click: () => {
              // TODO: Implement game selection
              console.log('Selected game:', game);
            }
          })),
          { type: 'separator' },
          {
            label: 'Add Game',
            click: addGame
          }
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
        label: 'Refresh',
        click: () => {
          // TODO: Implement refresh functionality
          console.log('Refreshing...');
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

// Wait for the app to be ready
app.whenReady().then(() => {
  console.log('App is ready, creating tray...');
  createTray();
});

// Handle window-all-closed event
app.on('window-all-closed', () => {
  console.log('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Log when the app is quitting
app.on('before-quit', () => {
  console.log('App is quitting');
}); 