import browser, { Runtime } from 'webextension-polyfill';

// Listen for extension installation
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Extension installed');
  }
});

// Listen for messages from popup or content script
browser.runtime.onMessage.addListener((message: unknown, sender: Runtime.MessageSender) => {
  console.log('Received message:', message, 'from:', sender);
}); 