import browser from 'webextension-polyfill';

console.log('Bookmarkstr content script loaded');

// Define interfaces for messages
interface NostrMessage {
  id: string;
  ext: string;
  type: string;
  params?: {
    event?: any;
    [key: string]: any;
  };
}

interface NostrResponse {
  id: string;
  ext: string;
  response: any;
  fromContentScript?: boolean;
}

// Connect to the background page
const port = browser.runtime.connect();

// Create a map to track pending requests to the background script
const pendingRequests: Record<string, { resolve: Function; reject: Function }> = {};

// Listen for window messages (from injected nostr-provider.js)
window.addEventListener('message', (event) => {
  // Only process messages from our own window
  if (event.source !== window) return;
  
  const data = event.data;
  
  // Type guard for NostrMessage
  const isNostrMessage = (msg: any): msg is NostrMessage => {
    return msg && typeof msg === 'object' && 
           typeof msg.id === 'string' && 
           typeof msg.ext === 'string' && 
           typeof msg.type === 'string';
  };
  
  // Check if this is a message for our extension
  if (isNostrMessage(data) && data.ext === 'bookmarkstr') {
    console.log('Content script received nostr message:', data);
    
    // Store the promise callbacks
    const id = data.id;
    
    // Create a Promise for this request
    const responsePromise = new Promise((resolve, reject) => {
      pendingRequests[id] = { resolve, reject };
    });
    
    // Forward the message to the background script
    port.postMessage(data);
    
    // Set a timeout to clean up if we don't get a response
    setTimeout(() => {
      if (pendingRequests[id]) {
        console.warn(`No response for request ${id} after 5 seconds`);
        pendingRequests[id].reject(new Error('Request timed out'));
        delete pendingRequests[id];
      }
    }, 5000);
  }
});

// Listen for responses from the background script
port.onMessage.addListener((message: any) => {
  console.log('Content script received message from background:', message);
  
  // Type guard for NostrResponse
  const isNostrResponse = (msg: any): msg is NostrResponse => {
    return msg && typeof msg === 'object' && 
           typeof msg.id === 'string' && 
           typeof msg.ext === 'string' && 
           'response' in msg;
  };
  
  // Check if this is a response to a pending request
  if (isNostrResponse(message) && pendingRequests[message.id]) {
    const { resolve, reject } = pendingRequests[message.id];
    
    // Process the response
    if (message.response && message.response.error) {
      reject(new Error(message.response.error.message));
    } else {
      resolve(message.response);
    }
    
    // Clean up
    delete pendingRequests[message.id];
    
    // Forward the response back to the page
    window.postMessage({
      ...message,
      fromContentScript: true
    }, '*');
  }
});

// Listen for messages from the extension
browser.runtime.onMessage.addListener((message: unknown) => {
  console.log('Content script received message from extension:', message);
  return Promise.resolve({ received: true });
});

// Inject the Nostr provider script
function injectScript(file: string) {
  const script = document.createElement('script');
  script.src = browser.runtime.getURL(file);
  script.onload = () => {
    console.log(`${file} injected successfully`);
    script.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

// Only inject in the extension's popup, not in every page
if (window.location.href.includes('popup.html')) {
  console.log('Injecting nostr-provider.js into popup');
  injectScript('nostr-provider.js');
} 