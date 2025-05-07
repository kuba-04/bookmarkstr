import browser, { Runtime } from 'webextension-polyfill';

// Define Nostr message types
interface NostrMessage {
  id: string;
  ext: string;
  type: string;
  params?: {
    event?: any;
    [key: string]: any;
  };
}

// Define Nostr response type
interface NostrResponse {
  id: string;
  ext: string;
  response: any;
}

// Listen for extension installation
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Extension installed');
  }
});

// Mapping of tab ids to ports
const tabPorts: Record<number, browser.Runtime.Port> = {};

// Listen for messages from popup or content script
browser.runtime.onMessage.addListener((message: unknown, sender: Runtime.MessageSender) => {
  console.log('Received message:', message, 'from:', sender);
  
  // Handle specific extension messages if needed
  return Promise.resolve({ received: true });
});

// Listen for content script connections
browser.runtime.onConnect.addListener((port) => {
  const tabId = port.sender?.tab?.id;
  
  if (!tabId) {
    console.warn('Port connected without tab ID');
    return;
  }

  console.log(`Port connected from tab ${tabId}`);

  // Store the port in our map
  tabPorts[tabId] = port;

  // Clean up when port disconnects
  port.onDisconnect.addListener(() => {
    console.log(`Port disconnected from tab ${tabId}`);
    delete tabPorts[tabId];
  });

  port.onMessage.addListener(async (message: unknown) => {
    console.log('Received port message:', message);

    // Type guard to check if this is a NostrMessage
    const isNostrMessage = (msg: any): msg is NostrMessage => {
      return msg && typeof msg === 'object' && 
             typeof msg.id === 'string' && 
             typeof msg.ext === 'string' && 
             typeof msg.type === 'string';
    };

    if (!isNostrMessage(message)) {
      console.warn('Invalid message format:', message);
      return;
    }

    if (isNostrMessage(message) && message.ext === 'bookmarkstr') {
      try {
        // Handle Nostr protocol messages
        switch (message.type) {
          case 'getPublicKey':
            // Get the stored public key from extension storage
            const { userPublicKey } = await chrome.storage.session.get('userPublicKey');
            const response: NostrResponse = {
              id: message.id,
              ext: 'bookmarkstr',
              response: userPublicKey || null
            };
            port.postMessage(response);
            break;
            
          case 'signEvent':
            // In a real implementation, you would sign the event with the user's private key
            // For now, we'll just add a dummy signature for testing
            if (message.params?.event) {
              const signedEvent = { ...message.params.event };
              // In production, this would be a real signature
              signedEvent.sig = '00'.repeat(32);
              const signResponse: NostrResponse = {
                id: message.id,
                ext: 'bookmarkstr',
                response: signedEvent
              };
              port.postMessage(signResponse);
            }
            break;
            
          default:
            console.log('Unknown message type:', message.type);
            const errorResponse: NostrResponse = {
              id: message.id,
              ext: 'bookmarkstr',
              response: { error: { message: `Unknown message type: ${message.type}` } }
            };
            port.postMessage(errorResponse);
        }
      } catch (error) {
        console.error('Error handling message:', error);
        const errorResponse: NostrResponse = {
          id: message.id,
          ext: 'bookmarkstr',
          response: { error: { message: 'Internal error processing request' } }
        };
        port.postMessage(errorResponse);
      }
    }
  });
}); 