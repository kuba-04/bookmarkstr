##### Frontend - React and Tailwind CSS for Browser Extensions:

- React 19 is used for building dynamic and interactive UI components.
- TypeScript 5 provides static type checking, leading to improved IDE support and fewer runtime errors.
- Tailwind CSS 3.4.17 facilitates rapid and consistent styling of the application.
- Radix UI components (react-checkbox and react-tabs) are leveraged to create accessible and customizable UI elements.

##### Browser Extension Framework:

- webextension-polyfill (v0.12.0) ensures smooth interaction with browser extension APIs across different browsers.
- Packaging scripts in package.json support building and packaging the extension for both Chrome and Firefox.

##### Decentralized Integration:

- nostr-tools (v2.10.4) is used to interface with the Nostr protocol for fetching bookmarks from decentralized relays.
- async-mutex and events help manage asynchronous operations, ensuring reliable data fetches.
- minidenticons generates unique identicons for users, enhancing the UI with personalized visuals.
- react-qr-code is available for QR code generation if needed for additional features.

##### Build Tools:

- esbuild (v0.14.54) is used for fast bundling and building of the project.
- esbuild-plugin-copy facilitates asset management during the build process.

##### Licensing:

- The project is released under the MIT license as specified in package.json.
