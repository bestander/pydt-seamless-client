import { app, Tray, Menu, nativeImage, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import Store from 'electron-store';

interface AppState {
  token?: string;
  selectedUser?: string;
}

const store = new Store<AppState>();

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
    // Create a simple icon programmatically
    const iconSize = 16;
    const icon = nativeImage.createEmpty();
    
    // Create a canvas to draw the icon
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(iconSize, iconSize);
    const ctx = canvas.getContext('2d');
    
    // Draw a blue background
    ctx.fillStyle = '#4A90E2';
    ctx.fillRect(0, 0, iconSize, iconSize);
    
    // Draw white text with smaller font
    ctx.fillStyle = 'white';
    ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', iconSize / 2, iconSize / 2);
    
    // Convert canvas to image
    const buffer = canvas.toBuffer('image/png');
    const image = nativeImage.createFromBuffer(buffer);
    
    // Create the tray
    tray = new Tray(image);
    console.log('Tray created successfully');
    
    // Set a tooltip
    tray.setToolTip('PYDT Super Client');
    
    // Update the menu
    updateTrayMenu();
  } catch (error) {
    console.error('Error creating tray:', error);
    
    // Fallback to a simple colored icon if canvas fails
    try {
      // Create a simple 1x1 pixel image with blue color
      const icon = nativeImage.createEmpty();
      const size = 16;
      
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
      
      tray = new Tray(resizedIcon);
      tray.setToolTip('PYDT Super Client');
      updateTrayMenu();
    } catch (fallbackError) {
      console.error('Fallback icon creation failed:', fallbackError);
    }
  }
}

function updateTrayMenu() {
  if (!tray) {
    console.error('Tray is null, cannot update menu');
    return;
  }

  try {
    const token = store.get('token');
    const selectedUser = store.get('selectedUser');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: token ? 'Token: ' + token.substring(0, 8) + '...' : 'Add Token',
        click: async () => {
          if (!token) {
            const result = await createInputWindow('Add Token', 'Please enter your PYDT token:');
            if (result) {
              store.set('token', result);
              updateTrayMenu();
            }
          }
        }
      },
      {
        label: selectedUser ? `User: ${selectedUser}` : 'Choose User',
        enabled: !!token,
        click: async () => {
          if (token) {
            const result = await createInputWindow('Choose User', 'Please enter your username:');
            if (result) {
              store.set('selectedUser', result);
              updateTrayMenu();
            }
          }
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