import React from 'react';
import { createRoot } from 'react-dom/client';

const Popup: React.FC = () => {
  return (
    <div className="min-w-[400px] min-h-[500px] p-4">
      <h1 className="text-2xl font-bold mb-4">Bookmarkstr</h1>
      <p>Welcome to Bookmarkstr - Your Nostr Bookmarks Manager</p>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
); 