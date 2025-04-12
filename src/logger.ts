import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Log window and messages storage
let logWindow: BrowserWindow | null = null;
let logMessages: { message: string; type: string }[] = [];

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

let updateSteamProfilesCacheCallback: ((cache: any) => void) | null = null;

export function setSteamProfilesCacheCallback(callback: (cache: any) => void) {
  updateSteamProfilesCacheCallback = callback;
}

export function updateSteamProfilesCache(cache: any) {
  if (updateSteamProfilesCacheCallback) {
    updateSteamProfilesCacheCallback(cache);
    originalConsoleLog('Steam profiles cache updated in logger:', Object.keys(cache).length, 'profiles');
    
    // Log the actual profiles for debugging - but don't use filterGameData here
    const profileList = Object.keys(cache).map(steamId => {
      const profile = cache[steamId];
      return `${steamId}: ${profile.personaname}`;
    });
    originalConsoleLog('Steam profiles in logger cache:', profileList);
  } else {
    originalConsoleLog('Warning: Steam profiles cache callback not set');
  }
}

// Function to filter game data to only include specific keys
function filterGameData(data: any): any {
  // If data is null or undefined, return as is
  if (data === null || data === undefined) {
    return data;
  }

  // If data is a string, number, boolean, or other primitive, return as is
  if (typeof data !== 'object') {
    return data;
  }

  // Check if this is a response from the steamProfiles API
  if (Array.isArray(data) && data.length > 0 && 
      typeof data[0] === 'object' && 
      'steamid' in data[0] && 
      'personaname' in data[0]) {
    // This is a steamProfiles response, only return steamId and name
    return data.map((profile: any) => ({
      steamId: profile.steamid,
      name: profile.personaname
    }));
  }

  // If data is an array, map over each item
  if (Array.isArray(data)) {
    return data.map(item => filterGameData(item));
  }

  // If data is an object, create a new object with only the keys we want
  const result: any = {};
  
  // Check if this is a game object
  if (typeof data === 'object' && 'gameId' in data) {
    // This is a game object, include specific game properties
    if ('displayName' in data) result.displayName = data.displayName;
    if ('gameId' in data) result.gameId = data.gameId;
    if ('gameTurnRangeKey' in data) result.gameTurnRangeKey = data.gameTurnRangeKey;
    if ('currentPlayerSteamId' in data) result.currentPlayerSteamId = data.currentPlayerSteamId;
    
    // If there are players, include them with their names
    if ('players' in data && Array.isArray(data.players)) {
      result.players = data.players.map((player: any) => {
        const filteredPlayer: any = {};
        if ('steamId' in player) {
          filteredPlayer.steamId = player.steamId;
          
          // Try to get the player name from the steamProfilesCache
          if (typeof global !== 'undefined' && 'steamProfilesCache' in global) {
            const steamProfilesCache = (global as any).steamProfilesCache;
            if (steamProfilesCache && typeof steamProfilesCache === 'object' && player.steamId in steamProfilesCache) {
              filteredPlayer.name = steamProfilesCache[player.steamId].personaname;
            }
          }
        }
        return filteredPlayer;
      });
    }
    
    return result;
  }
  
  // For other objects, include common properties we want to keep
  const keysToKeep = ['id', 'name', 'username', 'steamId', 'personaname', 'displayName', 'status', 'error', 'message'];
  
  for (const key in data) {
    if (keysToKeep.includes(key)) {
      result[key] = data[key];
    } else if (typeof data[key] === 'object') {
      // Recursively filter nested objects
      result[key] = filterGameData(data[key]);
    }
  }
  
  return result;
}

// Function to open the log window
export function openLogWindow() {
  if (logWindow) {
    logWindow.focus();
    return;
  }

  logWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'PYDT Super Client Logs',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Create a simple HTML page to display logs
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>PYDT Super Client Logs</title>
      <style>
        body {
          font-family: monospace;
          background-color: #1e1e1e;
          color: #d4d4d4;
          padding: 10px;
          margin: 0;
          overflow-wrap: break-word;
          white-space: pre-wrap;
        }
        .log-entry {
          margin-bottom: 5px;
          border-bottom: 1px solid #333;
          padding-bottom: 5px;
        }
        .error {
          color: #f48771;
        }
        .info {
          color: #9cdcfe;
        }
        .warn {
          color: #dcdcaa;
        }
        .timestamp {
          color: #6a9955;
        }
        #log-container {
          height: calc(100vh - 50px);
          overflow-y: auto;
        }
        .controls {
          position: sticky;
          top: 0;
          background-color: #1e1e1e;
          padding: 10px 0;
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid #333;
          margin-bottom: 10px;
        }
        button {
          background-color: #3c3c3c;
          color: #d4d4d4;
          border: 1px solid #555;
          padding: 5px 10px;
          cursor: pointer;
        }
        button:hover {
          background-color: #4c4c4c;
        }
      </style>
    </head>
    <body>
      <div class="controls">
        <button id="clear-btn">Clear Logs</button>
        <button id="copy-btn">Copy to Clipboard</button>
      </div>
      <div id="log-container"></div>
      <script>
        const logContainer = document.getElementById('log-container');
        const clearBtn = document.getElementById('clear-btn');
        const copyBtn = document.getElementById('copy-btn');
        
        // Function to add a log entry to the container
        window.addLogEntry = (message, type) => {
          const entry = document.createElement('div');
          entry.className = 'log-entry ' + type;
          
          const timestamp = new Date().toLocaleTimeString();
          const timestampSpan = document.createElement('span');
          timestampSpan.className = 'timestamp';
          timestampSpan.textContent = '[' + timestamp + '] ';
          
          const messageSpan = document.createElement('span');
          messageSpan.textContent = message;
          
          entry.appendChild(timestampSpan);
          entry.appendChild(messageSpan);
          logContainer.appendChild(entry);
          
          // Auto-scroll to bottom
          logContainer.scrollTop = logContainer.scrollHeight;
        };
        
        // Clear logs button
        clearBtn.addEventListener('click', () => {
          logContainer.innerHTML = '';
        });
        
        // Copy to clipboard button
        copyBtn.addEventListener('click', () => {
          const text = Array.from(logContainer.children)
            .map(entry => entry.textContent)
            .join('\\n');
          
          navigator.clipboard.writeText(text)
            .then(() => {
              const originalText = copyBtn.textContent;
              copyBtn.textContent = 'Copied!';
              setTimeout(() => {
                copyBtn.textContent = originalText;
              }, 2000);
            })
            .catch(err => {
              console.error('Failed to copy: ', err);
            });
        });
        
        // Load initial logs
        window.loadInitialLogs = (logs) => {
          logs.forEach(log => {
            window.addLogEntry(log.message, log.type);
          });
        };
      </script>
    </body>
    </html>
  `;

  // Write the HTML content to a temporary file
  const tempLogPath = path.join(os.tmpdir(), 'pydt-log.html');
  fs.writeFileSync(tempLogPath, htmlContent);

  // Load the HTML file
  logWindow.loadFile(tempLogPath);

  // When the window is closed, set the reference to null
  logWindow.on('closed', () => {
    logWindow = null;
  });

  // Wait for the window to be ready before sending logs
  logWindow.webContents.on('did-finish-load', () => {
    // Send all existing logs to the window
    logWindow?.webContents.executeJavaScript(`window.loadInitialLogs(${JSON.stringify(logMessages)})`);
  });
}

// Initialize the logger by overriding console methods
export function initializeLogger() {
  // Make the steamProfilesCache available to the filterGameData function
  (global as any).steamProfilesCache = {};
  
  // Log that the logger has been initialized
  originalConsoleLog('Logger initialized with steamProfilesCache');
  
  // Helper function to safely filter arguments
  const safeFilterArgs = (args: any[]) => {
    return args.map(arg => {
      // If it's not an object or is null, return as is
      if (typeof arg !== 'object' || arg === null) {
        return arg;
      }
      
      // Check if this is a steamProfiles API response
      if (Array.isArray(arg) && arg.length > 0 && 
          typeof arg[0] === 'object' && 
          'steamid' in arg[0] && 
          'personaname' in arg[0]) {
        return arg.map((profile: any) => ({
          steamId: profile.steamid,
          name: profile.personaname
        }));
      }
      
      // Check if this is a game object or array of games
      if (Array.isArray(arg) && arg.length > 0 && 
          typeof arg[0] === 'object' && 
          'gameId' in arg[0]) {
        return arg.map((game: any) => {
          const filteredGame: any = {};
          if ('displayName' in game) filteredGame.displayName = game.displayName;
          if ('gameId' in game) filteredGame.gameId = game.gameId;
          if ('gameTurnRangeKey' in game) filteredGame.gameTurnRangeKey = game.gameTurnRangeKey;
          if ('currentPlayerSteamId' in game) filteredGame.currentPlayerSteamId = game.currentPlayerSteamId;
          
          if ('players' in game && Array.isArray(game.players)) {
            filteredGame.players = game.players.map((player: any) => {
              const filteredPlayer: any = {};
              if ('steamId' in player) {
                filteredPlayer.steamId = player.steamId;
                
                // Try to get the player name from the steamProfilesCache
                if (typeof global !== 'undefined' && 'steamProfilesCache' in global) {
                  const steamProfilesCache = (global as any).steamProfilesCache;
                  if (steamProfilesCache && typeof steamProfilesCache === 'object' && player.steamId in steamProfilesCache) {
                    filteredPlayer.name = steamProfilesCache[player.steamId].personaname;
                  }
                }
              }
              return filteredPlayer;
            });
          }
          
          return filteredGame;
        });
      }
      
      // Check if this is a single game object
      if (typeof arg === 'object' && 'gameId' in arg) {
        const filteredGame: any = {};
        if ('displayName' in arg) filteredGame.displayName = arg.displayName;
        if ('gameId' in arg) filteredGame.gameId = arg.gameId;
        if ('gameTurnRangeKey' in arg) filteredGame.gameTurnRangeKey = arg.gameTurnRangeKey;
        if ('currentPlayerSteamId' in arg) filteredGame.currentPlayerSteamId = arg.currentPlayerSteamId;
        
        if ('players' in arg && Array.isArray(arg.players)) {
          filteredGame.players = arg.players.map((player: any) => {
            const filteredPlayer: any = {};
            if ('steamId' in player) {
              filteredPlayer.steamId = player.steamId;
              
              // Try to get the player name from the steamProfilesCache
              if (typeof global !== 'undefined' && 'steamProfilesCache' in global) {
                const steamProfilesCache = (global as any).steamProfilesCache;
                if (steamProfilesCache && typeof steamProfilesCache === 'object' && player.steamId in steamProfilesCache) {
                  filteredPlayer.name = steamProfilesCache[player.steamId].personaname;
                }
              }
            }
            return filteredPlayer;
          });
        }
        
        return filteredGame;
      }
      
      // For other objects, include common properties we want to keep
      const keysToKeep = ['id', 'name', 'username', 'steamId', 'personaname', 'displayName', 'status', 'error', 'message'];
      const result: any = {};
      
      for (const key in arg) {
        if (keysToKeep.includes(key)) {
          result[key] = arg[key];
        } else if (typeof arg[key] === 'object' && arg[key] !== null) {
          // Recursively filter nested objects
          result[key] = safeFilterArgs([arg[key]])[0];
        }
      }
      
      return result;
    });
  };
  
  // Override console.log
  console.log = (...args) => {
    // Filter game data if present
    const filteredArgs = safeFilterArgs(args);
    
    const message = filteredArgs.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    logMessages.push({ message, type: 'info' });
    originalConsoleLog.apply(console, args);
    
    if (logWindow) {
      logWindow.webContents.executeJavaScript(`window.addLogEntry(${JSON.stringify(message)}, 'info')`);
    }
  };

  // Override console.error
  console.error = (...args) => {
    
    // Filter game data if present
    const filteredArgs = safeFilterArgs(args);
    
    const message = filteredArgs.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    logMessages.push({ message, type: 'error' });
    originalConsoleError.apply(console, args);
    
    if (logWindow) {
      logWindow.webContents.executeJavaScript(`window.addLogEntry(${JSON.stringify(message)}, 'error')`);
    }
  };

  // Override console.warn
  console.warn = (...args) => {
    
    // Filter game data if present
    const filteredArgs = safeFilterArgs(args);
    
    const message = filteredArgs.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    logMessages.push({ message, type: 'warn' });
    originalConsoleWarn.apply(console, args);
    
    if (logWindow) {
      logWindow.webContents.executeJavaScript(`window.addLogEntry(${JSON.stringify(message)}, 'warn')`);
    }
  };

  // Override console.info
  console.info = (...args) => {
    
    // Filter game data if present
    const filteredArgs = safeFilterArgs(args);
    
    const message = filteredArgs.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    logMessages.push({ message, type: 'info' });
    originalConsoleInfo.apply(console, args);
    
    if (logWindow) {
      logWindow.webContents.executeJavaScript(`window.addLogEntry(${JSON.stringify(message)}, 'info')`);
    }
  };
} 