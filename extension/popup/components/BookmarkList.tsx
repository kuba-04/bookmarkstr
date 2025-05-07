import React from 'react';
import { ProcessedBookmark } from '../../common/types';
import BookmarkItem from './BookmarkItem';
import styles from '../styles/glassmorphism.module.css';

interface BookmarkListProps {
  bookmarks: ProcessedBookmark[];
  isLoading: boolean;
  error: string | null;
  onDeleteBookmark?: (bookmarkId: string) => Promise<void>;
}

const BookmarkList: React.FC<BookmarkListProps> = ({ bookmarks, isLoading, error, onDeleteBookmark }) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-700">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-3"></div>
        <p>Loading bookmarks...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div className={`${styles.glassCard} text-red-600 px-4 py-3 rounded-lg text-center max-w-sm`}>
          <p className="font-medium mb-1">Error loading bookmarks</p>
          <p className="text-sm text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-700">
        <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
        </svg>
        <p>No bookmarks found</p>
        <p className="text-sm text-gray-500 mt-1">Bookmarks you save will appear here</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-200">
      {bookmarks.map((bookmark) => {
        console.log('Rendering bookmark:', bookmark.id);
        const deleteHandler = onDeleteBookmark 
          ? () => {
              console.log('Delete handler called for bookmark:', bookmark.id);
              return onDeleteBookmark(bookmark.id);
            }
          : () => {
              console.log('Fallback delete handler called for bookmark:', bookmark.id);
              return Promise.resolve();
            };

        return (
          <li key={bookmark.id} className="py-3 first:pt-0 last:pb-0 hover:bg-gray-50 transition-colors rounded-sm">
            <BookmarkItem 
              bookmark={bookmark} 
              onDelete={deleteHandler}
            />
          </li>
        );
      })}
    </ul>
  );
};

export default BookmarkList; 