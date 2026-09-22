import { BrowserWindow, ipcMain, shell } from 'electron';
import Store from 'electron-store';
import { pydtApi, PYDTUser } from './api';
import { validateCivaSession } from './civa-api';
import { clearCivaSession, getCivaSessionToken } from './civa-account';

interface AppState {
  tokens: { [name: string]: string };  // name -> token mapping
  userData: { [token: string]: PYDTUser };
  /** When true, successful PYDT turn uploads also push the save to a linked Civa mirror. */
  syncTurnsToCiva: boolean;
  /** civa.us `session` cookie value for REST uploads. */
  civaSessionToken: string | null;
}

const store = new Store<AppState>({
  defaults: {
    tokens: {},
    userData: {},
    syncTurnsToCiva: false,
    civaSessionToken: null,
  }
});

export function getStore(): Store<AppState> {
  return store;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCivaStatusHtml(connectedName: string | null, invalidSession: boolean): string {
  if (connectedName) {
    return `<div id="civa-status" style="color: #0a6b0a; margin-bottom: 8px;">Signed in to Civa as <strong>${escapeHtml(connectedName)}</strong></div>`;
  }
  if (invalidSession) {
    return `<div id="civa-status" style="color: #a33; margin-bottom: 8px;">Saved Civa session is invalid — paste a new one below.</div>`;
  }
  return `<div id="civa-status" style="color: #666; margin-bottom: 8px;">Not signed in to Civa</div>`;
}

async function resolveCivaDisplayName(): Promise<{ name: string | null; invalidSession: boolean }> {
  const token = getCivaSessionToken();
  if (!token) return { name: null, invalidSession: false };
  const player = await validateCivaSession(token);
  return { name: player?.name ?? null, invalidSession: !player };
}

export async function addUser(onAccountChange?: () => void): Promise<boolean> {
  const tokens = store.get('tokens', {});
  const civaStatus = await resolveCivaDisplayName();
  const civaConnectedName = civaStatus.name;
  const userList = Object.keys(tokens).map(username => `
    <div style="display: flex; justify-content: space-between; align-items: center; margin: 5px 0; padding: 5px; background: #f5f5f5; border-radius: 4px;">
      <span>${username}</span>
      <button onclick="removeUser('${username}')" style="background: #ff4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button>
    </div>
  `).join('');

  const htmlContent = `
    <html>
      <head>
        <title>Login / Accounts</title>
        <style>
          body { font-family: system-ui; padding: 20px; }
          input { width: 100%; padding: 8px; margin: 10px 0; box-sizing: border-box; }
          button { padding: 8px 16px; margin-right: 8px; margin-top: 4px; }
          a { color: #0066cc; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .section { margin: 15px 0; }
          .section-title { font-weight: bold; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="section">
          <div class="section-title">Add PYDT account</div>
          <input type="text" id="input" placeholder="Enter your PYDT authentication token" />
          <div style="margin: 10px 0;">
            <small>To get your token, <a href="#" onclick="openProfile(); return false;">open your PYDT profile</a>.</small>
          </div>
          <button onclick="submit()">Add Account</button>
          <button onclick="cancel()">Close</button>
        </div>
        <div class="section" id="saved-accounts-section">
          <div class="section-title">Saved PYDT accounts</div>
          <div id="saved-accounts-list">${userList || '<div style="color: #666;">No accounts saved yet</div>'}</div>
        </div>
        <div class="section" id="civa-section">
          <div class="section-title">Civa (optional)</div>
          ${buildCivaStatusHtml(civaConnectedName, civaStatus.invalidSession)}
          <input type="text" id="civa-input" placeholder="Paste your civa.us session cookie" autocomplete="off" />
          <div style="margin: 10px 0;">
            <small>Sign in at <a href="#" onclick="openCiva(); return false;">civa.us</a>, then copy the <code>session</code> cookie (browser dev tools → Application → Cookies).</small>
          </div>
          <button onclick="saveCiva()">Save Civa session</button>
          <button onclick="logoutCiva()" id="civa-logout-btn" style="${getCivaSessionToken() ? '' : 'display:none'}">Log out from Civa</button>
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
          function openCiva() {
            require('electron').shell.openExternal('https://civa.us');
          }
          function saveCiva() {
            require('electron').ipcRenderer.send('save-civa-token', document.getElementById('civa-input').value);
          }
          function logoutCiva() {
            require('electron').ipcRenderer.send('clear-civa-token');
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
    width: 440,
    height: 520,
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
            
            // Close the window
            if (win && !win.isDestroyed()) {
              win.close();
            }
            
            // Call the callback function if provided
            if (onAccountChange) {
              onAccountChange();
            }
            
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
                  document.querySelector('button').onclick = () => {
                    if (window.close) {
                      window.close();
                    } else {
                      require('electron').ipcRenderer.send('close-error-window');
                    }
                  };
                  function openProfile() {
                    require('electron').shell.openExternal('https://www.playyourdamnturn.com/user/profile');
                  }
                </script>
              </body>
            </html>
          `;

          errorWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
          
          // Add a handler for closing the error window
          ipcMain.once('close-error-window', () => {
            if (errorWin && !errorWin.isDestroyed()) {
              errorWin.close();
            }
          });
          
          resolve(false);
        }
      } else {
        if (win && !win.isDestroyed()) {
          win.close();
        }
        resolve(false);
      }
    });

    const refreshSavedAccountsList = (tokenMap: { [name: string]: string }) => {
      if (!win || win.isDestroyed()) return;
      const accountsList = Object.keys(tokenMap).map(username => `
          <div style="display: flex; justify-content: space-between; align-items: center; margin: 5px 0; padding: 5px; background: #f5f5f5; border-radius: 4px;">
            <span>${username}</span>
            <button onclick="removeUser('${username}')" style="background: #ff4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button>
          </div>
        `).join('') || '<div style="color: #666;">No accounts saved yet</div>';

      win.webContents.executeJavaScript(`
          const list = document.getElementById('saved-accounts-list');
          if (list) list.innerHTML = \`${accountsList}\`;
        `).catch(err => {
          console.error('Error updating accounts list:', err);
        });
    };

    const refreshCivaSection = (connectedName: string | null, hasToken: boolean) => {
      if (!win || win.isDestroyed()) return;
      const statusHtml = buildCivaStatusHtml(connectedName, hasToken && !connectedName);
      win.webContents.executeJavaScript(`
          const status = document.getElementById('civa-status');
          if (status) status.outerHTML = \`${statusHtml}\`;
          const logoutBtn = document.getElementById('civa-logout-btn');
          if (logoutBtn) logoutBtn.style.display = ${hasToken ? "'inline-block'" : "'none'"};
          const input = document.getElementById('civa-input');
          if (input && ${connectedName ? 'true' : 'false'}) input.value = '';
        `).catch(err => {
          console.error('Error updating Civa section:', err);
        });
    };

    const saveCivaHandler = async (_: Electron.IpcMainEvent, value: string) => {
      const trimmed = value?.trim();
      if (!trimmed) {
        return;
      }
      const player = await validateCivaSession(trimmed);
      if (!player) {
        if (win && !win.isDestroyed()) {
          win.webContents.executeJavaScript(`alert('Invalid Civa session. Sign in at civa.us and copy the session cookie again.');`);
        }
        return;
      }
      store.set('civaSessionToken', trimmed);
      console.log(`Civa session saved for ${player.name}`);
      refreshCivaSection(player.name, true);
      if (onAccountChange) {
        onAccountChange();
      }
    };

    const clearCivaHandler = () => {
      clearCivaSession();
      refreshCivaSection(null, false);
      if (onAccountChange) {
        onAccountChange();
      }
    };

    ipcMain.on('save-civa-token', saveCivaHandler);
    ipcMain.on('clear-civa-token', clearCivaHandler);

    ipcMain.once('remove-user', (_, username) => {
      const tokens = store.get('tokens', {});
      delete tokens[username];
      store.set('tokens', tokens);
      
      const userData = store.get('userData', {});
      delete userData[username];
      store.set('userData', userData);
      
      // Call the callback function if provided
      if (onAccountChange) {
        onAccountChange();
      }
      
      // Check if window exists and is not destroyed before updating
      if (win && !win.isDestroyed()) {
        refreshSavedAccountsList(tokens);

        // Close the window after a short delay to allow the UI to update
        setTimeout(() => {
          if (win && !win.isDestroyed()) {
            win.close();
          }
        }, 500);
      }
    });

    win.on('closed', () => {
      ipcMain.removeListener('save-civa-token', saveCivaHandler);
      ipcMain.removeListener('clear-civa-token', clearCivaHandler);
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