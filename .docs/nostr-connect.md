Directory structure:
└── lumehq-nostr-connect/
    ├── README.md
    ├── babel.config.js
    ├── biome.json
    ├── build.js
    ├── package.json
    ├── pnpm-lock.yaml
    ├── tailwind.config.js
    ├── tsconfig.json
    ├── extension/
    │   ├── background.js
    │   ├── common.js
    │   ├── content-script.js
    │   ├── global.d.ts
    │   ├── icons.jsx
    │   ├── nostr-provider.js
    │   ├── options.html
    │   ├── options.tsx
    │   ├── popup.html
    │   ├── popup.tsx
    │   ├── prompt.html
    │   ├── prompt.tsx
    │   ├── style.css
    │   ├── .DS_Store
    │   ├── build/
    │   │   └── style.css
    │   ├── chrome/
    │   │   └── manifest.json
    │   ├── firefox/
    │   │   └── manifest.json
    │   ├── icons/
    │   │   └── .DS_Store
    │   ├── output/
    │   │   ├── background.build.js
    │   │   ├── common.js
    │   │   ├── content-script.build.js
    │   │   ├── manifest.json
    │   │   ├── nostr-provider.js
    │   │   ├── options.build.js
    │   │   ├── options.html
    │   │   ├── popup.build.js
    │   │   ├── popup.html
    │   │   ├── prompt.build.js
    │   │   ├── prompt.html
    │   │   ├── style.css
    │   │   ├── .keep
    │   │   └── icons/
    │   └── releases/
    │       └── .keep
    └── Nostr Connect/
        ├── iOS (App)/
        │   ├── AppDelegate.swift
        │   ├── Info.plist
        │   ├── SceneDelegate.swift
        │   └── Base.lproj/
        │       ├── LaunchScreen.storyboard
        │       └── Main.storyboard
        ├── iOS (Extension)/
        │   └── Info.plist
        ├── macOS (App)/
        │   ├── AppDelegate.swift
        │   ├── Info.plist
        │   ├── Nostr Connect.entitlements
        │   └── Base.lproj/
        │       └── Main.storyboard
        ├── macOS (Extension)/
        │   ├── Info.plist
        │   └── Nostr Connect.entitlements
        ├── Nostr Connect.xcodeproj/
        │   ├── project.pbxproj
        │   ├── project.xcworkspace/
        │   │   ├── contents.xcworkspacedata
        │   │   ├── xcshareddata/
        │   │   │   └── IDEWorkspaceChecks.plist
        │   │   └── xcuserdata/
        │   │       └── phong.xcuserdatad/
        │   └── xcuserdata/
        │       └── phong.xcuserdatad/
        │           └── xcschemes/
        │               └── xcschememanagement.plist
        ├── Shared (App)/
        │   ├── ViewController.swift
        │   ├── Assets.xcassets/
        │   │   ├── Contents.json
        │   │   ├── AccentColor.colorset/
        │   │   │   └── Contents.json
        │   │   ├── AppIcon.appiconset/
        │   │   │   └── Contents.json
        │   │   └── LargeIcon.imageset/
        │   │       └── Contents.json
        │   ├── Base.lproj/
        │   │   └── Main.html
        │   └── Resources/
        │       ├── Script.js
        │       └── Style.css
        └── Shared (Extension)/
            └── SafariWebExtensionHandler.swift

