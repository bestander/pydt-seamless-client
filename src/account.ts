import { BrowserWindow, ipcMain, shell } from 'electron';
import Store from 'electron-store';
import { pydtApi, PYDTUser } from './api';

interface AppState {
  tokens: { [name: string]: string };  // name -> token mapping
  selectedToken: string | null;
  userData: { [token: string]: PYDTUser };
}

const store = new Store<AppState>({
  defaults: {
    tokens: {},
    selectedToken: null,
    userData: {}
  }
});

export function getStore(): Store<AppState> {
  return store;
}

export async function addUser(): Promise<boolean> {
  const tokens = store.get('tokens', {});
  const userList = Object.keys(tokens).map(username => `
    <div style="display: flex; justify-content: space-between; align-items: center; margin: 5px 0; padding: 5px; background: #f5f5f5; border-radius: 4px;">
      <span>${username}</span>
      <button onclick="removeUser('${username}')" style="background: #ff4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button>
    </div>
  `).join('');

  const htmlContent = `
    <html>
      <head>
        <title>Manage PYDT Accounts</title>
        <style>
          body { font-family: system-ui; padding: 20px; }
          input { width: 100%; padding: 8px; margin: 10px 0; }
          button { padding: 8px 16px; margin-right: 8px; }
          a { color: #0066cc; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .section { margin: 15px 0; }
          .section-title { font-weight: bold; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="section">
          <div class="section-title">Add New Account</div>
          <input type="text" id="input" placeholder="Enter your PYDT authentication token" />
          <div style="margin: 10px 0;">
            <small>To get your token, <a href="#" onclick="openProfile(); return false;">click here to open your profile page</a>.</small>
          </div>
          <button onclick="submit()">Add Account</button>
          <button onclick="cancel()">Close</button>
        </div>
        <div class="section">
          <div class="section-title">Saved Accounts</div>
          ${userList || '<div style="color: #666;">No accounts saved yet</div>'}
        </div>
        <script>
          function submit() {
            require('electron').ipcRenderer.send('input-response', document.getElementById('input').value);
          }
          function cancel() {
            require('electron').ipcRenderer.send('input-response', null);
          }
          function openProfile() {
            require('electron').shell.openExternal('https://www.playyourdamnturn.com/user/profile');
          }
          function removeUser(username) {
            if (confirm('Are you sure you want to remove this account?')) {
              require('electron').ipcRenderer.send('remove-user', username);
            }
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
      contextIsolation: false
    },
    frame: true,
    resizable: false
  });

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  return new Promise((resolve) => {
    ipcMain.once('input-response', async (_, value) => {
      if (value) {
        try {
          // Test the token by trying to get user data
          const userData = await pydtApi.getUserData(value);
          
          console.log('Received user data:', userData);
          
          if (userData && userData.displayName) {
            console.log('Valid user data received, username:', userData.displayName);
            // If successful, store the token with the username from the API
            const tokens = store.get('tokens', {});
            tokens[userData.displayName] = value;
            store.set('tokens', tokens);
            
            // Update user data
            const currentUserData = store.get('userData', {});
            store.set('userData', {
              ...currentUserData,
              [userData.displayName]: userData
            });
            
            // Set selected token
            store.set('selectedToken', userData.displayName);
            
            win.close();
            resolve(true);
          } else {
            console.error('Invalid user data structure:', userData);
            throw new Error('Invalid user data received');
          }
        } catch (error) {
          console.error('Error validating token:', error);
          // Show error message to user
          const errorWin = new BrowserWindow({
            width: 400,
            height: 200,
            webPreferences: {
              nodeIntegration: true,
              contextIsolation: false
            },
            frame: true,
            resizable: false
          });

          const errorHtml = `
            <html>
              <head>
                <title>Error</title>
                <style>
                  body { font-family: system-ui; padding: 20px; }
                  button { padding: 8px 16px; margin-right: 8px; }
                  a { color: #0066cc; text-decoration: none; }
                  a:hover { text-decoration: underline; }
                </style>
              </head>
              <body>
                <h3>Invalid token</h3>
                <p>Please make sure you've copied the correct token from your <a href="#" onclick="openProfile(); return false;">profile page</a>.</p>
                <button onclick="window.close()">OK</button>
                <script>
                  document.querySelector('button').onclick = () => require('electron').remote.getCurrentWindow().close();
                  function openProfile() {
                    require('electron').shell.openExternal('https://www.playyourdamnturn.com/user/profile');
                  }
                </script>
              </body>
            </html>
          `;

          errorWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
          resolve(false);
        }
      } else {
        win.close();
        resolve(false);
      }
    });

    ipcMain.once('remove-user', (_, username) => {
      const tokens = store.get('tokens', {});
      delete tokens[username];
      store.set('tokens', tokens);
      
      const userData = store.get('userData', {});
      delete userData[username];
      store.set('userData', userData);
      
      if (store.get('selectedToken') === username) {
        store.delete('selectedToken');
      }
      
      // Check if window exists and is not destroyed before updating
      if (win && !win.isDestroyed()) {
        const accountsList = Object.keys(tokens).map(username => `
          <div style="display: flex; justify-content: space-between; align-items: center; margin: 5px 0; padding: 5px; background: #f5f5f5; border-radius: 4px;">
            <span>${username}</span>
            <button onclick="removeUser('${username}')" style="background: #ff4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button>
          </div>
        `).join('') || '<div style="color: #666;">No accounts saved yet</div>';

        win.webContents.executeJavaScript(`
          const savedAccountsSection = document.querySelector('.section:nth-child(2)');
          if (savedAccountsSection) {
            const content = savedAccountsSection.querySelector('div:not(.section-title)');
            if (content) {
              content.innerHTML = \`${accountsList}\`;
            }
          }
        `).catch(err => {
          console.error('Error updating window:', err);
          // If the update fails, reload the window as a fallback
          if (win && !win.isDestroyed()) {
            win.reload();
          }
        });
      }
    });

    win.on('closed', () => {
      resolve(false);
    });
  });
}

export async function refreshUserData(tokenName: string) {
  try {
    const tokens = store.get('tokens', {});
    const token = tokens[tokenName];
    if (!token) {
      console.error('Token not found for user:', tokenName);
      return null;
    }

    const userData = await pydtApi.getUserData(token);
    const currentUserData = store.get('userData', {});
    if (userData) {
      store.set('userData', {
        ...currentUserData,
        [tokenName]: userData
      });
    } else {
      // If no user data, remove the entry instead of setting to null
      const newUserData = { ...currentUserData };
      delete newUserData[tokenName];
      store.set('userData', newUserData);
    }
    return userData;
  } catch (error) {
    console.error('Error refreshing user data:', error);
    // On error, remove the user data entry instead of setting to null
    const currentUserData = store.get('userData', {});
    const newUserData = { ...currentUserData };
    delete newUserData[tokenName];
    store.set('userData', newUserData);
    return null;
  }
} 