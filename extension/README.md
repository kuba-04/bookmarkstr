# Bookmarkstr Extension

## Directory Structure

The extension is organized as follows:

```
extension/
├── background/        # Background script code
├── popup/             # Popup UI code
├── common/            # Shared utilities
├── content-script.ts  # Content script
├── popup.html         # HTML for the popup
├── style.css          # Shared styles
├── nostr-provider.js  # Nostr provider script
├── chrome/            # Chrome-specific files
│   └── manifest.json  # Chrome manifest
├── firefox/           # Firefox-specific files
│   └── manifest.json  # Firefox manifest
└── output/            # Build output directory
    ├── icons/         # Extension icons
    └── ...            # Compiled files
```

## Building the Extension

To build the extension for Chrome:

```
node build.js
```

To build the extension for Firefox:

```
node build.js firefox
```

For production builds, add the `prod` flag:

```
node build.js prod
# or
node build.js firefox prod
```

The build output is placed in the `extension/output` directory, ready to be loaded into the browser.

## Development

The code is structured to share as much as possible between the Chrome and Firefox versions, with only the manifest files being browser-specific. When making changes:

1. Edit shared files in the root extension directory
2. Only modify the browser-specific manifest files when necessary
3. Run the appropriate build command to test your changes
