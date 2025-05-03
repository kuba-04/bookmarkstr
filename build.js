#!/usr/bin/env node

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isProd = process.argv.includes('prod');
const isFirefox = process.argv.includes('firefox');

// Setup output directories
const outputDir = 'extension/output';
const chromeDir = 'extension/chrome';
const firefoxDir = 'extension/firefox';
const targetDir = isFirefox ? firefoxDir : chromeDir;

// Make sure the output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Copy manifest from browser-specific directory
function copyManifest() {
  fs.copyFileSync(
    path.join(targetDir, 'manifest.json'), 
    path.join(outputDir, 'manifest.json')
  );
  console.log('Copied manifest.json from', isFirefox ? 'Firefox' : 'Chrome');
}

// Copy static files
function copyFiles() {
  // Copy popup.html
  fs.copyFileSync('extension/popup.html', path.join(outputDir, 'popup.html'));
  
  // Copy CSS
  if (fs.existsSync('extension/style.css')) {
    fs.copyFileSync('extension/style.css', path.join(outputDir, 'style.css'));
  }
  
  // Copy nostr-provider.js
  fs.copyFileSync('extension/nostr-provider.js', path.join(outputDir, 'nostr-provider.js'));
  
  console.log('Copied static files');
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
    console.log('Built JavaScript files');
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

// Copy files to browser-specific directory for development
function copyToBrowserDir() {
  if (isProd) return; // Only needed for development

  // Copy built JS files
  fs.copyFileSync(path.join(outputDir, 'background.js'), path.join(targetDir, 'background.build.js'));
  fs.copyFileSync(path.join(outputDir, 'content-script.js'), path.join(targetDir, 'content-script.build.js'));
  fs.copyFileSync(path.join(outputDir, 'popup.js'), path.join(targetDir, 'popup.js'));
  
  // Copy static files
  fs.copyFileSync('extension/popup.html', path.join(targetDir, 'popup.html'));
  if (fs.existsSync('extension/style.css')) {
    fs.copyFileSync('extension/style.css', path.join(targetDir, 'style.css'));
  }
  fs.copyFileSync('extension/nostr-provider.js', path.join(targetDir, 'nostr-provider.js'));
  
  console.log(`Copied files to ${targetDir} for development`);
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
  
  console.log('Watching for changes...');
  
  dirsToWatch.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    
    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith('.ts') || filename.endsWith('.tsx'))) {
        console.log(`File changed: ${filename}`);
        buildJs().then(() => {
          copyToBrowserDir(); // Copy files after rebuild
        }).catch(err => {
          console.error('Error during rebuild:', err);
        });
      }
    });
  });
  
  // Also watch core files
  fs.watch('extension', (eventType, filename) => {
    if (filename === 'popup.html' || filename === 'style.css' || filename === 'nostr-provider.js') {
      console.log(`File changed: ${filename}`);
      copyFiles();
      copyToBrowserDir(); // Copy to browser dir too
    }
  });
  
  // Watch manifest files
  fs.watch(targetDir, (eventType, filename) => {
    if (filename === 'manifest.json') {
      console.log(`Manifest changed`);
      copyManifest();
    }
  });
}

// Main build function
async function build() {
  console.log(`Building for ${isFirefox ? 'Firefox' : 'Chrome'} in ${isProd ? 'production' : 'development'} mode`);
  
  // Copy manifest
  copyManifest();
  
  // Copy static files
  copyFiles();
  
  // Build JavaScript
  await buildJs();
  
  // Copy to browser-specific directory for development
  copyToBrowserDir();
  
  console.log('Build completed successfully!');
  
  // Watch for changes in development mode
  if (!isProd) {
    watchChanges();
  }
}

build(); 