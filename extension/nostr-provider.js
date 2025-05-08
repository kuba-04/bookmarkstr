// Nostr provider script for Bookmarkstr extension
console.log("Nostr provider loaded");

// Define our extension name for messaging
const EXTENSION = "bookmarkstr";

// Create the window.nostr object
window.nostr = {
	_requests: {},
	_pubkey: null,

	async getPublicKey() {
		if (this._pubkey) return this._pubkey;
		this._pubkey = await this._call("getPublicKey", {});
		return this._pubkey;
	},

	async signEvent(event) {
		return this._call("signEvent", { event });
	},

	async getRelays() {
		return this._call("getRelays", {});
	},

	nip04: {
		async encrypt(peer, plaintext) {
			return window.nostr._call("nip04.encrypt", { peer, plaintext });
		},

		async decrypt(peer, ciphertext) {
			return window.nostr._call("nip04.decrypt", { peer, ciphertext });
		},
	},

	_call(type, params) {
		const id = Math.random().toString().slice(-4);
		console.log(
			`%c[${EXTENSION}:%c${id}%c]%c calling %c${type}%c with %c${JSON.stringify(params || {})}`,
			"background-color:#4a90e2;font-weight:bold;color:white",
			"background-color:#4a90e2;font-weight:bold;color:#a92727",
			"background-color:#4a90e2;color:white;font-weight:bold",
			"color:auto",
			"font-weight:bold;color:#08589d;font-family:monospace",
			"color:auto",
			"font-weight:bold;color:#90b12d;font-family:monospace",
		);
		return new Promise((resolve, reject) => {
			this._requests[id] = { resolve, reject };
			window.postMessage(
				{
					id,
					ext: EXTENSION,
					type,
					params,
				},
				"*",
			);
            
            // For development - auto-resolve after a short delay if we're in the popup
            // This is just a fallback for testing
            setTimeout(() => {
                if (this._requests[id]) {
                    console.warn(`[${EXTENSION}:${id}] Auto-resolving request after timeout`);
                    if (type === "signEvent" && params.event) {
                        // Sign the event with a dummy signature for testing
                        const signedEvent = { ...params.event };
                        signedEvent.sig = "00".repeat(32);
                        this._requests[id].resolve(signedEvent);
                    } else if (type === "getPublicKey") {
                        // Return a dummy public key for testing
                        this._requests[id].resolve("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
                    } else {
                        this._requests[id].resolve({});
                    }
                    delete this._requests[id];
                }
            }, 100);
		});
	},
};

// Handle response messages from the extension
window.addEventListener("message", (message) => {
	if (
		!message.data ||
		message.data.response === null ||
		message.data.response === undefined ||
		message.data.ext !== EXTENSION ||
		!window.nostr._requests[message.data.id]
	)
		return;

	if (message.data.response.error) {
		const error = new Error(
			`${EXTENSION}: ${message.data.response.error.message}`,
		);
		error.stack = message.data.response.error.stack;
		window.nostr._requests[message.data.id].reject(error);
	} else {
		window.nostr._requests[message.data.id].resolve(message.data.response);
	}

	console.log(
		`%c[${EXTENSION}:%c${message.data.id}%c]%c result: %c${JSON.stringify(
			message?.data?.response || message?.data?.response?.error?.message || {},
		)}`,
		"background-color:#4a90e2;font-weight:bold;color:white",
		"background-color:#4a90e2;font-weight:bold;color:#a92727",
		"background-color:#4a90e2;color:white;font-weight:bold",
		"color:auto",
		"font-weight:bold;color:#08589d",
	);

	delete window.nostr._requests[message.data.id];
});