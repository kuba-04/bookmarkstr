import browser from 'webextension-polyfill';

// Listen for messages from the extension
browser.runtime.onMessage.addListener((message: unknown) => {
  console.log('Content script received message:', message);
  return Promise.resolve({ received: true });
}); 