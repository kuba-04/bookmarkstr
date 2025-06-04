import React, { useState } from 'react';
import { ProcessedBookmark } from '../../common/types';
import BookmarkItem from './BookmarkItem';
import styles from '../styles/glassmorphism.module.css';

interface BookmarkListProps {
  bookmarks: ProcessedBookmark[];
  isLoading: boolean;
  error: string | null;
  onDeleteBookmark?: (bookmarkId: string) => Promise<void>;
  onRefresh?: () => void;
}

const BookmarkList: React.FC<BookmarkListProps> = ({ bookmarks, isLoading, error, onDeleteBookmark, onRefresh }) => {
  const [sortOldestFirst, setSortOldestFirst] = useState(false);

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

  const sortedBookmarks = [...bookmarks].sort((a, b) => {
    const dateA = a.createdAt;
    const dateB = b.createdAt;
    return sortOldestFirst ? dateA - dateB : dateB - dateA;
  });

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSortOldestFirst(!sortOldestFirst)}
            className="px-2.5 py-1 text-xs font-medium text-indigo-600 border border-indigo-600 rounded hover:bg-indigo-50 transition-colors"
          >
            {sortOldestFirst ? 'Latest' : 'Oldest'}
          </button>
          <button
            onClick={onRefresh}
            className="px-2.5 py-1 text-xs font-medium text-indigo-600 border border-indigo-600 rounded hover:bg-indigo-50 transition-colors"
            title="Refresh bookmarks"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>
      <ul className="divide-y divide-gray-200">
        {sortedBookmarks.map((bookmark) => {
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
    </div>
  );
};

export default BookmarkList; 