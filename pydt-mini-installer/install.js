#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const extract = require('extract-zip');
const os = require('os');
const { exec } = require('child_process');

const APP_NAME = 'PYDT Mini.app';
const VERSION = require('./package.json').version;
const RELEASE_URL = `https://github.com/bestander/pydt-seamless-client/releases/download/${VERSION}/PYDT.Mini-${VERSION}-arm64-mac.zip`;
const INSTALL_DIR = path.join(os.homedir(), 'Applications');

async function downloadFile(url, outputPath) {
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'arraybuffer'
  });
  await fs.writeFile(outputPath, response.data);
}

function openApplicationsFolder() {
  if (process.platform === 'darwin') {
    exec(`open "${INSTALL_DIR}"`, (error) => {
      if (error) {
        console.error('Failed to open Applications folder:', error);
      }
    });
  }
}

async function install() {
  try {
    console.log(`Downloading PYDT Mini v${VERSION}...`);
    const tempDir = path.join(os.tmpdir(), 'pydt-mini-install');
    const zipPath = path.join(tempDir, 'pydt-mini.zip');
    
    // Create temp directory
    await fs.ensureDir(tempDir);
    
    // Download the zip file
    await downloadFile(RELEASE_URL, zipPath);
    
    console.log('Extracting...');
    // Extract the zip file
    await extract(zipPath, { dir: tempDir });
    
    console.log('Installing to Applications folder...');
    // Move the .app file to Applications
    const appPath = path.join(INSTALL_DIR, APP_NAME);
    await fs.move(path.join(tempDir, APP_NAME), appPath, { overwrite: true });
    
    // Clean up
    await fs.remove(tempDir);
    
    console.log(`\nPYDT Mini v${VERSION} has been installed to ${appPath}`);
    console.log('\nOpening Applications folder...');
    openApplicationsFolder();
    console.log('\nTo start the app:');
    console.log('1. Right-click on PYDT Mini and select "Open"');
    console.log('2. Click "Open" in the security dialog');
    
  } catch (error) {
    console.error('Installation failed:', error.message);
    process.exit(1);
  }
}

install(); 