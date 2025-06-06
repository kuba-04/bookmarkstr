import React from 'react';
import './globals.css';

export const metadata = {
  title: 'Bookmarkstr',
  description: 'A nostr bookmark manager',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
} 