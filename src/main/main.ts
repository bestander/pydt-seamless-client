import { app, Tray, Menu, nativeImage, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import * as fs from 'fs';

interface AppState {
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

function createTrayIcon() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  
  // Create a red square icon
  const size = 16;
  const imageData = new Uint8Array(size * size * 4);
  for (let i = 0; i < imageData.length; i += 4) {
    imageData[i] = 255;   // R (red)
    imageData[i + 1] = 0; // G
    imageData[i + 2] = 0; // B
    imageData[i + 3] = 255; // A (fully opaque)
  }
  
  const icon = nativeImage.createFromBuffer(Buffer.from(imageData), {
    width: size,
    height: size
  });
  
  // Save the icon to a file
  fs.writeFileSync(iconPath, icon.toPNG());
  
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
          console.log('Refreshing...');
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

    // Set the context menu
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