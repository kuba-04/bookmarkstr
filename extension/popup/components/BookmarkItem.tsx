import React from 'react';
import { ProcessedBookmark } from '../../common/types';

interface BookmarkItemProps {
  bookmark: ProcessedBookmark;
}

// Helper function to format timestamp (you might want a more sophisticated library later)
const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp * 1000); // Convert seconds to milliseconds
    return date.toLocaleString(); // Basic local time string
};

// Helper function to render common parts (like timestamp)
const renderMetadata = (bookmark: ProcessedBookmark) => (
    <span className="text-xs text-gray-400 font-medium">{formatTimestamp(bookmark.created_at)}</span>
);

// Function to detect image URLs in content
const findImageUrls = (content: string): string[] => {
  // Basic image URL regex pattern
  const imagePattern = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/gi;
  return content.match(imagePattern) || [];
};

// Function to detect URLs in content and make them clickable
const makeUrlsClickable = (content: string): React.ReactNode[] => {
  if (!content) return [content];
  
  // URL regex pattern - match non-whitespace chars to avoid capturing trailing punctuation
  const urlPattern = /(https?:\/\/\S+)/gi;
  
  // Extract all URLs from the content
  const matches = Array.from(content.matchAll(urlPattern));
  
  if (matches.length === 0) {
    return [content];
  }
  
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  
  // Process each matched URL
  matches.forEach((match, idx) => {
    const url = match[0];
    const startIndex = match.index!;
    
    // Add text before the URL
    if (startIndex > lastIndex) {
      result.push(content.substring(lastIndex, startIndex));
    }
    
    // Remove trailing punctuation from URL
    const cleanUrl = url.replace(/[.,;:!?]$/, '');
    
    // Add the URL as a clickable link
    result.push(
      <a 
        key={`url-${idx}`}
        href={cleanUrl} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="text-blue-600 hover:text-blue-700 break-all font-medium transition-colors duration-150"
      >
        {cleanUrl}
      </a>
    );
    
    // Update lastIndex to after this URL
    lastIndex = startIndex + url.length;
  });
  
  // Add any remaining text after the last URL
  if (lastIndex < content.length) {
    result.push(content.substring(lastIndex));
  }
  
  return result;
};

// Common image styles for consistent rendering
const imageContainerStyle = {
  maxWidth: '100%',
  display: 'flex',
  justifyContent: 'center',
  margin: '4px 0'
};

const imageStyle = {
  maxHeight: '120px',
  maxWidth: '100%',
  height: 'auto',
  objectFit: 'contain' as const,
  borderRadius: '6px'
};

const BookmarkItem: React.FC<BookmarkItemProps> = ({ bookmark }) => {
  const renderBookmarkContent = () => {
    switch (bookmark.type) {
      case 'url': {
        // Check if the URL is an image
        const isImage = bookmark.url.match(/\.(jpeg|jpg|gif|png|webp)$/i) !== null;
        
        if (isImage) {
          return (
            <div className="flex flex-col items-start w-full space-y-2">
              <div style={imageContainerStyle}>
                <a 
                  href={bookmark.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:opacity-90 transition-opacity rounded-lg overflow-hidden"
                >
                  <img 
                    src={bookmark.url} 
                    alt="Bookmarked image" 
                    style={imageStyle}
                    className="hover:shadow-lg transition-shadow duration-200"
                  />
                </a>
              </div>
              <div className="flex justify-end w-full">
                {renderMetadata(bookmark)}
              </div>
            </div>
          );
        }
        
        return (
          <div className="flex flex-col space-y-1 w-full">
            <a 
              href={bookmark.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-blue-600 hover:text-blue-700 break-all font-medium transition-colors duration-150"
              title={bookmark.url}
            >
              {bookmark.url}
            </a>
            <div className="flex justify-end">
              {renderMetadata(bookmark)}
            </div>
          </div>
        );
      }
      
      case 'note': {
        const imageUrls = bookmark.content ? findImageUrls(bookmark.content) : [];
        const textContent = bookmark.content || `Note ID: ${bookmark.eventId}`;
        
        // Extract all URLs for comparison with image URLs
        const allUrlMatches = textContent.match(/(https?:\/\/\S+)/gi) || [];
        
        return (
          <div className="flex flex-col items-start w-full space-y-3">
            <p className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed w-full">
              {makeUrlsClickable(textContent)}
            </p>
            
            {imageUrls.length > 0 && (
              <div className="w-full grid grid-cols-2 gap-2">
                {imageUrls.map((url, index) => {
                  // Only render image if it's not already displayed as clickable URL
                  // (Skip duplicates where the URL appears exactly once in the content)
                  const exactUrlCount = allUrlMatches.filter(match => match === url).length;
                  if (exactUrlCount === 1) return null;
                  
                  return (
                    <div key={index} className="relative group">
                      <a 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="block hover:opacity-95 transition-opacity"
                      >
                        <img 
                          src={url} 
                          alt={`Image ${index + 1}`} 
                          style={imageStyle}
                          className="hover:shadow-lg transition-shadow duration-200 w-full"
                        />
                      </a>
                    </div>
                  );
                }).filter(Boolean)}
              </div>
            )}
            
            <div className="flex justify-end w-full">
              {renderMetadata(bookmark)}
            </div>
          </div>
        );
      }
      
      case 'article':
        return (
          <div className="flex flex-col space-y-2">
            <div className="flex items-start">
              <svg className="w-4 h-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
              <span className="font-mono text-sm break-all text-gray-600 w-full" title={`Article Naddr: ${bookmark.naddr}`}>
                {`Article: ${bookmark.naddr}`}
              </span>
            </div>
            <div className="flex items-center justify-between w-full text-xs">
              {bookmark.relayHint && (
                <span className="text-gray-400 flex items-center" title={`Relay Hint: ${bookmark.relayHint}`}>
                  <svg className="w-3 h-3 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="break-all">{bookmark.relayHint}</span>
                </span>
              )}
              {renderMetadata(bookmark)}
            </div>
          </div>
        );
         
      case 'hashtag':
        return (
          <div className="flex flex-col space-y-1">
            <span className="text-purple-600 font-medium hover:text-purple-700 transition-colors duration-150 break-all">
              #{bookmark.hashtag}
            </span>
            <div className="flex justify-end">
              {renderMetadata(bookmark)}
            </div>
          </div>
        );
        
      default:
        console.warn('Unknown bookmark type:', bookmark);
        return (
          <div className="flex items-center text-red-500">
            <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Unknown Bookmark Type
          </div>
        );
    }
  };

  return (
    <li className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow duration-200 overflow-hidden">
      {renderBookmarkContent()}
    </li>
  );
};

export default BookmarkItem; 