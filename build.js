#!/usr/bin/env node

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { spawn } = require('child_process');

const isProd = process.argv.includes('prod');

// Setup output directories
const outputDir = 'extension/output';
const chromeDir = 'extension/chrome';
const firefoxDir = 'extension/firefox';

// Make sure the output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Copy manifests for both browsers
function copyManifests() {
  // Copy Chrome manifest
  fs.copyFileSync(
    path.join(chromeDir, 'manifest.json'),
    path.join(chromeDir, 'manifest.build.json')
  );
  
  // Copy Firefox manifest
  fs.copyFileSync(
    path.join(firefoxDir, 'manifest.json'),
    path.join(firefoxDir, 'manifest.build.json')
  );
}

// Copy static files to both browser directories
function copyFiles() {
  const browsers = [chromeDir, firefoxDir];
  
  browsers.forEach(browserDir => {
    // Copy popup.html
    fs.copyFileSync('extension/popup.html', path.join(browserDir, 'popup.html'));
    
    // Copy nostr-provider.js
    fs.copyFileSync('extension/nostr-provider.js', path.join(browserDir, 'nostr-provider.js'));

    // Copy icon
    fs.copyFileSync('extension/Bookmarkstr.png', path.join(browserDir, 'Bookmarkstr.png'));
  });
}

// Build CSS
function buildCss() {
  try {
    // Build to output dir
    execSync(`pnpm exec tailwindcss -i ./extension/popup/popup.css -o ${path.join(outputDir, 'popup.css')}${isProd ? ' --minify' : ''}`);
    
    // Copy to both browser directories
    fs.copyFileSync(path.join(outputDir, 'popup.css'), path.join(chromeDir, 'popup.css'));
    fs.copyFileSync(path.join(outputDir, 'popup.css'), path.join(firefoxDir, 'popup.css'));
  } catch (error) {
    console.error('Error building CSS:', error);
  }
}

// Build the JavaScript files
async function buildJs() {
  try {
    await esbuild.build({
      entryPoints: {
        'popup': 'extension/popup/popup.tsx',
        'background': 'extension/background/background.ts',
        'content-script': 'extension/content-script.ts'
      },
      bundle: true,
      outdir: outputDir,
      platform: 'browser',
      target: 'es2020',
      format: 'esm',
      minify: isProd,
      sourcemap: !isProd,
      logLevel: 'info',
    });
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

// Copy files to browser directories
function copyToBrowserDirs() {
  const browsers = [chromeDir, firefoxDir];
  
  browsers.forEach(browserDir => {
    // Copy built JS files
    fs.copyFileSync(path.join(outputDir, 'background.js'), path.join(browserDir, 'background.build.js'));
    fs.copyFileSync(path.join(outputDir, 'content-script.js'), path.join(browserDir, 'content-script.build.js'));
    fs.copyFileSync(path.join(outputDir, 'popup.js'), path.join(browserDir, 'popup.js'));
    
    // Copy static files
    fs.copyFileSync('extension/popup.html', path.join(browserDir, 'popup.html'));
    fs.copyFileSync('extension/nostr-provider.js', path.join(browserDir, 'nostr-provider.js'));
  });
}

// Watch for changes and rebuild
function watchChanges() {
  if (isProd) return;
  
  const dirsToWatch = [
    'extension/popup',
    'extension/background',
    'extension/content',
    'extension/common'
  ];
  
  // Keep track of rebuild state to prevent loops
  let isRebuilding = false;
  let pendingRebuild = false;
  
  const processSourceChange = async () => {
    if (isRebuilding) {
      pendingRebuild = true;
      return;
    }
    
    try {
      isRebuilding = true;
      
      // Build JS
      await buildJs();
      
      // Build CSS
      buildCss();
      
      // Copy files to both browser directories
      copyToBrowserDirs();
      
    } catch (err) {
      console.error('Error during rebuild:', err);
    } finally {
      isRebuilding = false;
      
      // If changes happened during rebuild, process them
      if (pendingRebuild) {
        pendingRebuild = false;
        setTimeout(processSourceChange, 100);
      }
    }
  };
  
  // Watch only source files, not output files
  dirsToWatch.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    
    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      
      // Only rebuild for code changes, not for CSS changes (to avoid loops)
      if (filename.endsWith('.tsx') || filename.endsWith('.ts')) {
        processSourceChange();
      } else if (filename.endsWith('.css')) {
        buildCss();
      }
    });
  });
  
  // Watch core files
  fs.watch('extension', { recursive: false }, (eventType, filename) => {
    if (!filename) return;
    
    if (filename === 'popup.html' || filename === 'nostr-provider.js') {
      copyFiles();
      copyToBrowserDirs();
    }
  });
  
  // Watch manifest files
  const browsers = [chromeDir, firefoxDir];
  browsers.forEach(browserDir => {
    fs.watch(browserDir, { recursive: false }, (eventType, filename) => {
      if (filename === 'manifest.json') {
        copyManifests();
      }
    });
  });
}

// Main build function
async function build() {
  // Copy manifests
  copyManifests();
  
  // Copy static files
  copyFiles();
  
  // Build CSS
  buildCss();
  
  // Build JavaScript
  await buildJs();
  
  // Copy to browser directories
  copyToBrowserDirs();
  
  // Watch for changes in development mode
  if (!isProd) {
    watchChanges();
  }
}

build(); 