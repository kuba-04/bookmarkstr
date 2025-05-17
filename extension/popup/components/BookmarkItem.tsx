import React, { useState } from 'react';
import { ProcessedBookmark } from '../../common/types';
import styles from '../styles/glassmorphism.module.css';

interface BookmarkItemProps {
  bookmark: ProcessedBookmark;
  onDelete?: () => Promise<void>;  // Make it optional to avoid type errors
}

// Helper function to format timestamp (you might want a more sophisticated library later)
const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp * 1000); // Convert seconds to milliseconds
    return date.toLocaleString(); // Basic local time string
};

// Helper function to render common parts (like timestamp)
const renderMetadata = (bookmark: ProcessedBookmark) => {
  return (
    <span className="text-xs text-gray-400 font-medium">Added {formatTimestamp(bookmark.createdAt)}</span>
  );
};

// Function to detect image URLs in content
const findImageUrls = (content: string): string[] => {
  // Basic image URL regex pattern
  const imagePattern = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/gi;
  return content.match(imagePattern) || [];
};

// Function to detect URLs in content and make them clickable
const makeUrlsClickable = (content: string | undefined) => {
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
        className="text-indigo-600 hover:text-indigo-700 break-all font-medium transition-colors duration-150"
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

const BookmarkItem: React.FC<BookmarkItemProps> = ({ bookmark, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Function to truncate text to a specific number of characters
  const truncateText = (text: string, maxLength: number = 300) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDelete) {
      try {
        await onDelete();
      } catch (error) {
        console.error('Error deleting bookmark:', error);
      }
    }
  };

  const handleOpenInPrimal = (e: React.MouseEvent, eventId: string) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(`https://primal.net/e/${eventId}`, '_blank');
  };

  const renderBookmarkContent = (bookmark: ProcessedBookmark) => {
    switch (bookmark.type) {
      case 'website': {
        // Check if the URL is an image
        const isImage = bookmark.url.match(/\.(jpeg|jpg|gif|png|webp)$/i) !== null;
        
        if (isImage) {
          return (
            <div className={`flex flex-col items-start w-full space-y-2 ${styles.bookmarkItem}`}>
              <div className="w-full mb-1 flex justify-between items-start">
                <h3 className="text-gray-800 font-medium text-base truncate flex-1 mr-2">{bookmark.title}</h3>
                <button
                  onClick={handleDelete}
                  className={`p-1.5 text-red-600 rounded-full ${styles.glassDisconnect} transition-colors duration-200 hover:bg-red-50 flex-shrink-0`}
                  title="Delete bookmark"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <div style={imageContainerStyle}>
                <a 
                  href={bookmark.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:opacity-90 transition-opacity rounded-lg overflow-hidden"
                >
                  <img 
                    src={bookmark.url} 
                    alt={bookmark.title} 
                    style={imageStyle}
                    className="hover:shadow-lg transition-shadow duration-200 border border-gray-100 rounded-lg"
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
          <div className={`flex flex-col space-y-2 w-full ${styles.bookmarkItem}`}>
            <div className="flex justify-between items-start mb-1">
              <h3 className="text-gray-800 font-medium text-base truncate flex-1 mr-2">{bookmark.title}</h3>
              <button
                onClick={handleDelete}
                className={`p-1.5 text-red-600 rounded-full ${styles.glassDisconnect} transition-colors duration-200 hover:bg-red-50 flex-shrink-0`}
                title="Delete bookmark"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
            <a 
              href={bookmark.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-indigo-600 hover:text-indigo-700 break-all text-sm transition-colors duration-150 hover:underline"
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
        const content = bookmark.content;
        const imageUrls = content ? findImageUrls(content) : [];
        const textContent = content || "";
        const allUrlMatches = textContent.match(/(https?:\/\/\S+)/gi) || [];
        const shouldTruncate = textContent.length > 300;
        
        return (
          <div className={`flex flex-col items-start w-full space-y-3 ${styles.bookmarkItem}`}>
            <div className="w-full mb-1 flex justify-between items-start">
              <div className="flex-1 mr-2">
                <div className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed w-full overflow-hidden" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                  {makeUrlsClickable(isExpanded ? textContent : truncateText(textContent))}
                  {shouldTruncate && (
                    <button
                      onClick={() => setIsExpanded(!isExpanded)}
                      className=" mt-4 text-indigo-600 hover:text-indigo-700 font-medium ml-1 focus:outline-none hover:underline"
                    >
                      {isExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col space-y-2">
                <button
                  onClick={(e) => handleOpenInPrimal(e, bookmark.eventId)}
                  className={`p-1.5 text-indigo-600 rounded-full ${styles.glassDisconnect} transition-colors duration-200 hover:bg-indigo-50 flex-shrink-0`}
                  title="Open in Primal.net"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
                <button
                  onClick={handleDelete}
                  className={`p-1.5 text-red-600 rounded-full ${styles.glassDisconnect} transition-colors duration-200 hover:bg-red-50 flex-shrink-0`}
                  title="Delete bookmark"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
            
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
                          className="hover:shadow-lg transition-shadow duration-200 w-full border border-gray-100 rounded-lg"
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

  return renderBookmarkContent(bookmark);
};

export default BookmarkItem; 