#!/usr/bin/env node

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { spawn } = require('child_process');

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
  
  // Copy nostr-provider.js
  fs.copyFileSync('extension/nostr-provider.js', path.join(outputDir, 'nostr-provider.js'));
  
  console.log('Copied static files');
}

// Build CSS
function buildCss(outPath) {
  try {
    console.log('Building CSS to', outPath);
    execSync(`pnpm exec tailwindcss -i ./extension/popup/popup.css -o ${outPath}${isProd ? ' --minify' : ''}`);
    console.log('CSS build complete');
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
  
  // Do not use Tailwind's watch process - it causes rebuild loops
  // Instead, rebuild CSS manually when needed
  
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
      
      // Build CSS to output dir
      buildCss(path.join(outputDir, 'popup.css'));
      
      // Build CSS directly to target browser dir
      buildCss(path.join(targetDir, 'popup.css'));
      
      // Copy files
      copyToBrowserDir();
      
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
        console.log(`Source file changed: ${filename}`);
        processSourceChange();
      } else if (filename.endsWith('.css')) {
        console.log(`CSS file changed: ${filename}`);
        // Just build CSS files, don't rebuild JS
        buildCss(path.join(outputDir, 'popup.css'));
        buildCss(path.join(targetDir, 'popup.css'));
      }
    });
  });
  
  // Watch core files
  fs.watch('extension', { recursive: false }, (eventType, filename) => {
    if (!filename) return;
    
    if (filename === 'popup.html' || filename === 'nostr-provider.js') {
      console.log(`Core file changed: ${filename}`);
      copyFiles();
      copyToBrowserDir();
    }
  });
  
  // Watch manifest files
  fs.watch(targetDir, { recursive: false }, (eventType, filename) => {
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
  
  // Build CSS
  buildCss(path.join(outputDir, 'popup.css'));
  
  // In dev mode, also build CSS to browser dir
  if (!isProd) {
    buildCss(path.join(targetDir, 'popup.css'));
  }
  
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