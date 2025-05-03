# Nostr Bookmarks Viewer

## Table of Contents

- [Project Description](#project-description)
- [Tech Stack](#tech-stack)
- [Getting Started Locally](#getting-started-locally)
- [Available Scripts](#available-scripts)
- [Project Scope](#project-scope)
- [Project Status](#project-status)
- [License](#license)

## Project Description

Nostr Bookmarks Viewer is a desktop browser extension designed for viewing your Nostr bookmarks securely and efficiently. With a seamless login experience using a private key, this extension quickly fetches active relays and displays your bookmarks in a clear chronological order. Bookmarks containing URLs are rendered as clickable links, allowing you to navigate to resources directly in a new browser tab. User-friendly error messages and a responsive design ensure a smooth experience even under varied network conditions.

## Tech Stack

- **Frontend:**
  - **React 19** – For building dynamic and interactive UI components.
  - **TypeScript 5** – Provides static type checking for increased reliability.
  - **Tailwind CSS 3.4.17** – Facilitates rapid and consistent styling.
  - **Radix UI** – Utilizes components like react-checkbox and react-tabs for accessible UI elements.
- **Browser Extension Framework:**
  - **webextension-polyfill v0.12.0** – Ensures smooth interaction with browser extension APIs across different browsers.
- **Decentralized Integration:**
  - **nostr-tools v2.10.4** – Interfaces with the Nostr protocol for fetching bookmark data.
  - **async-mutex & events** – Manage asynchronous operations and data fetching reliably.
  - **minidenticons** – Generates unique identicons for personalized UI visuals.
  - **react-qr-code** – Provides QR code generation capabilities.
- **Build Tools:**
  - **esbuild v0.14.54** – Fast bundling and building of the project.
  - **esbuild-plugin-copy** – Manages asset copying during the build process.

## Getting Started Locally

Follow these instructions to set up and run the project on your local machine:

1. **Clone the repository:**

   ```sh
   git clone https://github.com/your-username/nostr-bookmarks-viewer.git
   cd nostr-bookmarks-viewer
   ```

2. **Install dependencies:**
   Use your preferred package manager:

   ```sh
   pnpm install
   ```

   or

   ```sh
   npm install
   ```

3. **Run in development mode:**
   Start the development server and watch for Tailwind CSS updates:

   ```sh
   pnpm run dev
   ```

4. **Building for Production:**
   To build the production version and package the extension, use:

   - For a generic build:
     ```sh
     pnpm run build
     ```
   - To package for **Chrome**:
     ```sh
     pnpm run package:chrome
     ```
   - To package for **Firefox**:
     ```sh
     pnpm run package:firefox
     ```

5. **Loading the Extension:**
   - For Chrome, go to `chrome://extensions`, enable developer mode, and load the unpacked extension from the appropriate build directory.
   - For Firefox, use the add-on installation process with the generated `.xpi` file.

## Available Scripts

The following scripts are defined in the `package.json`:

- **dev:**  
  Runs the development server and watches for CSS changes:

  ```sh
  pnpm run dev
  ```

- **build:**  
  Builds the production version of the extension:

  ```sh
  pnpm run build
  ```

- **package:chrome:**  
  Builds and packages the extension for Chrome (with minified assets), then creates a zip archive:

  ```sh
  pnpm run package:chrome
  ```

- **package:firefox:**  
  Builds and packages the extension for Firefox (with minified assets), then creates an `.xpi` file:
  ```sh
  pnpm run package:firefox
  ```

## Project Scope

- **Focus:**  
  The project is solely focused on viewing Nostr bookmarks. It does not include features for creating, editing, or deleting bookmarks.
- **User Authentication:**  
  Users authenticate securely using their private key, which is used only for the session and never stored.
- **Desktop Experience:**  
  Designed specifically as a desktop browser extension, ensuring an optimal experience on desktop devices.
- **Data Handling:**  
  Bookmarks are loaded once per session, and the interface provides a clear loading state and error messaging to guide the user.

## Project Status

This project is currently under active development as a Minimum Viable Product (MVP). It incorporates:

- Secure login and relay fetching.
- Chronological bookmark display with clickable URL links.
- Comprehensive error handling and responsive UI feedback.
  Future updates will focus on enhancing user experience, refining error management, and expanding feature support based on user feedback.

## License

This project is released under the [MIT License](LICENSE).

---

Feel free to explore the repository and contribute to further improvements!
