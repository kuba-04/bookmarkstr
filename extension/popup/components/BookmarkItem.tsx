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
    <span className="text-xs text-gray-500 ml-2">({formatTimestamp(bookmark.created_at)})</span>
);

// Function to detect image URLs in content
const findImageUrls = (content: string): string[] => {
  // Basic image URL regex pattern
  const imagePattern = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/gi;
  return content.match(imagePattern) || [];
};

// Common image styles for consistent rendering
const imageContainerStyle = {
  maxWidth: '100%',
  display: 'flex',
  justifyContent: 'center',
  margin: '4px 0'
};

const imageStyle = {
  maxHeight: '80px',
  maxWidth: '100%',
  height: 'auto',
  objectFit: 'contain' as const,
  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
  border: '1px solid #e5e7eb',
  borderRadius: '4px'
};

const BookmarkItem: React.FC<BookmarkItemProps> = ({ bookmark }) => {
  const renderBookmarkContent = () => {
    switch (bookmark.type) {
      case 'url': {
        // Check if the URL is an image
        const isImage = bookmark.url.match(/\.(jpeg|jpg|gif|png|webp)$/i) !== null;
        
        if (isImage) {
          return (
            <div className="flex flex-col items-start w-full">
              <div style={imageContainerStyle}>
                <a 
                  href={bookmark.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:opacity-90 transition-opacity"
                >
                  <img 
                    src={bookmark.url} 
                    alt="Bookmarked image" 
                    style={imageStyle}
                  />
                </a>
              </div>
              <div className="flex items-center w-full">
                <span className="text-xs text-gray-500 overflow-hidden text-ellipsis break-all mr-2">
                  {bookmark.url.length > 50 ? `${bookmark.url.substring(0, 47)}...` : bookmark.url}
                </span>
                {renderMetadata(bookmark)}
              </div>
            </div>
          );
        }
        
        return (
          <>
            <a 
              href={bookmark.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-blue-600 hover:underline break-all"
              title={bookmark.url}
            >
              {bookmark.url.length > 50 ? `${bookmark.url.substring(0, 47)}...` : bookmark.url}
            </a>
            {renderMetadata(bookmark)}
          </>
        );
      }
      
      case 'note': {
        // Process content to find image URLs
        const imageUrls = bookmark.content ? findImageUrls(bookmark.content) : [];
        const textContent = bookmark.content || `Note ID: ${bookmark.eventId}`;
        
        return (
          <div className="flex flex-col items-start w-full">
            {/* Text content */}
            <p className="text-sm mb-2 whitespace-pre-wrap break-words">
              {textContent}
            </p>
            
            {/* Image previews */}
            {imageUrls.length > 0 && (
              <div className="w-full">
                {imageUrls.map((url, index) => (
                  <div key={index} style={imageContainerStyle}>
                    <a 
                      href={url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="hover:opacity-90 transition-opacity"
                    >
                      <img 
                        src={url} 
                        alt={`Image ${index + 1}`} 
                        style={imageStyle}
                      />
                    </a>
                  </div>
                ))}
              </div>
            )}
            
            {/* Metadata row - simplified to only show timestamp */}
            <div className="flex items-center w-full mt-1 justify-end">
                {renderMetadata(bookmark)}
            </div>
          </div>
        );
      }
      
      case 'article':
         return (
           <div className="flex flex-col items-start">
             <span className="font-mono text-sm break-all mb-1" title={`Article Naddr: ${bookmark.naddr}`}>
                 {`Article: ${bookmark.naddr.substring(0, 15)}...`}
             </span>
             <div className="flex items-center w-full">
               {bookmark.relayHint && <span className="text-xs text-gray-400" title={`Relay Hint: ${bookmark.relayHint}`}> (Relay)</span>}
               <span className="flex-grow"></span>
               {renderMetadata(bookmark)}
             </div>
           </div>
         );
         
      case 'hashtag':
        return (
          <>
            <span className="text-purple-600">#{bookmark.hashtag}</span>
            {renderMetadata(bookmark)}
          </>
        );
        
      default:
        console.warn('Unknown bookmark type:', bookmark);
        return <span className="text-red-500">Unknown Bookmark Type</span>;
    }
  };

  return (
    <li className="py-2 px-3 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors duration-150 ease-in-out">
      {renderBookmarkContent()}
    </li>
  );
};

export default BookmarkItem; 