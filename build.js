#!/usr/bin/env node

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isProd = process.argv.includes('prod');
const isFirefox = process.argv.includes('firefox');

// Setup output directories
const buildDir = 'extension/build';
const outputDir = 'extension/output';
const chromeDir = 'extension/chrome';
const firefoxDir = 'extension/firefox';

const outdir = isProd ? outputDir : buildDir;
const targetBrowserDir = isFirefox ? firefoxDir : chromeDir;

// Make sure the output directory exists
if (!fs.existsSync(outdir)) {
  fs.mkdirSync(outdir, { recursive: true });
}

// Create the manifest.json
function createManifest() {
  const manifest = {
    manifest_version: 3,
    name: "Bookmarkstr",
    version: "1.0.0",
    description: "A Nostr-based bookmarks viewer extension",
    permissions: [
      "storage",
      "activeTab"
    ],
    action: {
      default_popup: "popup.html"
    },
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["content-script.js"]
      }
    ]
  };

  // Browser-specific configurations
  if (isFirefox) {
    manifest.background = {
      scripts: ["background.js"],
      type: "module"
    };
  } else {
    manifest.background = {
      service_worker: "background.js",
      type: "module"
    };
  }

  fs.writeFileSync(path.join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Created manifest.json for', isFirefox ? 'Firefox' : 'Chrome');
}

// Copy static files
function copyFiles() {
  // Copy popup.html and adjust paths if needed
  const popupHtml = fs.readFileSync('extension/popup.html', 'utf8')
    .replace('popup/popup.js', 'popup.js');
  fs.writeFileSync(path.join(outdir, 'popup.html'), popupHtml);

  // Copy CSS
  if (fs.existsSync('extension/style.css')) {
    fs.copyFileSync('extension/style.css', path.join(outdir, 'style.css'));
  }
  
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
      outdir: outdir,
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
        buildJs().catch(err => {
          console.error('Error during rebuild:', err);
        });
      }
    });
  });
  
  // Also watch manifest and popup.html
  fs.watch('extension', (eventType, filename) => {
    if (filename === 'manifest.json' || filename === 'popup.html') {
      console.log(`File changed: ${filename}`);
      createManifest();
      copyFiles();
    }
  });
}

// Main build function
async function build() {
  console.log(`Building for ${isFirefox ? 'Firefox' : 'Chrome'} in ${isProd ? 'production' : 'development'} mode`);
  
  // Create manifest first
  createManifest();
  
  // Copy static files
  copyFiles();
  
  // Build JavaScript
  await buildJs();
  
  // Copy files to browser-specific directory
  copyToBrowserDir();
  
  console.log('Build completed successfully!');
  
  // Watch for changes in development mode
  if (!isProd) {
    watchChanges();
  }
}

// Copy built files to browser-specific directory
function copyToBrowserDir() {
  // Make sure the browser directory exists
  if (!fs.existsSync(targetBrowserDir)) {
    fs.mkdirSync(targetBrowserDir, { recursive: true });
  }
  
  // Copy the built js files with correct names
  fs.copyFileSync(path.join(outdir, 'background.js'), path.join(targetBrowserDir, 'background.build.js'));
  fs.copyFileSync(path.join(outdir, 'content-script.js'), path.join(targetBrowserDir, 'content-script.build.js'));
  
  // Copy the HTML and CSS files
  fs.copyFileSync(path.join(outdir, 'popup.html'), path.join(targetBrowserDir, 'popup.html'));
  if (fs.existsSync(path.join(outdir, 'style.css'))) {
    fs.copyFileSync(path.join(outdir, 'style.css'), path.join(targetBrowserDir, 'style.css'));
  }
  
  // Copy popup.js
  fs.copyFileSync(path.join(outdir, 'popup.js'), path.join(targetBrowserDir, 'popup.js'));
  
  // Create or copy nostr-provider.js
  const nostrProviderPath = path.join(targetBrowserDir, 'nostr-provider.js');
  if (!fs.existsSync(nostrProviderPath)) {
    fs.writeFileSync(nostrProviderPath, '// Nostr provider script\nconsole.log("Nostr provider loaded");');
    console.log('Created nostr-provider.js');
  }
  
  console.log(`Copied files to ${targetBrowserDir}`);
}

build(); 