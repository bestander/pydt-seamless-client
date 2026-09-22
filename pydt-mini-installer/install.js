#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const extract = require('extract-zip');
const os = require('os');
const { exec } = require('child_process');

const APP_NAME = 'pydt-mini.app';
const VERSION = require('./package.json').version;
const RELEASE_URL = `https://github.com/bestander/pydt-seamless-client/releases/download/${VERSION}/pydt-mini-${VERSION}-arm64-mac.zip`;
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
    
    // Clean up any existing app in the temp directory before extraction
    const tempAppPath = path.join(tempDir, APP_NAME);
    if (await fs.pathExists(tempAppPath)) {
      console.log('Removing existing files in temp directory...');
      await fs.remove(tempAppPath);
    }
    
    // Extract the zip file
    await extract(zipPath, { dir: tempDir });
    
    console.log('Installing to Applications folder...');
    // Move the .app file to Applications
    const appPath = path.join(INSTALL_DIR, APP_NAME);
    
    // Remove existing app in Applications folder if it exists
    if (await fs.pathExists(appPath)) {
      console.log('Removing existing installation...');
      await fs.remove(appPath);
    }
    
    // Move the app to Applications
    await fs.move(tempAppPath, appPath, { overwrite: true });
    
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
    // Provide more detailed error information
    if (error.code === 'EEXIST') {
      console.error('A file or symlink already exists. This might be due to a previous installation.');
      console.error('Try manually removing the existing installation and run the installer again.');
    }
    process.exit(1);
  }
}

install(); 