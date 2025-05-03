import React from 'react';
import { ProcessedBookmark } from '../../common/types';
import BookmarkItem from './BookmarkItem';

interface BookmarkListProps {
  bookmarks: ProcessedBookmark[];
  isLoading: boolean;
  error: string | null;
}

const BookmarkList: React.FC<BookmarkListProps> = ({ bookmarks, isLoading, error }) => {
  if (isLoading) {
    return <div className="p-4 text-center text-gray-500">Loading bookmarks...</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-red-500">Error: {error}</div>;
  }

  if (bookmarks.length === 0) {
    return <div className="p-4 text-center text-gray-500">No bookmarks found.</div>;
  }

  return (
    <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md shadow-sm overflow-hidden">
      {bookmarks.map((bookmark) => (
        <BookmarkItem key={bookmark.id} bookmark={bookmark} />
      ))}
    </ul>
  );
};

export default BookmarkList; 