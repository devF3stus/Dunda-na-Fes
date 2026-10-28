import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Library,
  AlertTriangle,
  X,
  FolderPlus,
} from 'lucide-react';
import {
  fetchLibraryEntries,
  updateLibraryEntry,
  deleteLibraryEntry,
} from '../api/client';
import LibraryItemCard from '../components/LibraryItemCard';
import ConfirmModal from '../components/ConfirmModal';

export default function LibraryPage({
  onCountChange,
  onNavigateToStaging,
}) {
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State for delete confirmation modal
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadLibrary = useCallback(
    async (searchValue = searchQuery) => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchLibraryEntries(searchValue);
        const list = data.items || [];
        setItems(list);
        if (!searchValue.trim() && onCountChange) {
          onCountChange(list.length);
        }
      } catch (err) {
        setError(err.message || 'Could not load your Library.');
      } finally {
        setLoading(false);
      }
    },
    [searchQuery, onCountChange]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      loadLibrary(searchQuery);
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery, loadLibrary]);

  const handleRename = async (id, payload) => {
    const { item: updated } = await updateLibraryEntry(id, payload);
    setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteLibraryEntry(itemToDelete.id);
      setItems((prev) => {
        const next = prev.filter((it) => it.id !== itemToDelete.id);
        if (!searchQuery.trim() && onCountChange) {
          onCountChange(next.length);
        }
        return next;
      });
      setItemToDelete(null);
    } catch (err) {
      setError(err.message || 'Failed to delete Library entry.');
      setItemToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Your Stem Library
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Play, rename, download, or manage separated vocals and instrumental tracks.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by song name or notes..."
              aria-label="Search Library"
              className="w-full pl-9 pr-8 py-2 rounded-xl text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => loadLibrary(searchQuery)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Friendly Error Banner */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-200"
        >
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">Library Action Failed</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && items.length === 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-12 flex flex-col items-center justify-center text-center space-y-3">
          <RefreshCw className="w-7 h-7 animate-spin text-indigo-500" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Loading your separated tracks...
          </p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-800 p-12 flex flex-col items-center justify-center text-center space-y-4">
          <div className="p-4 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Library className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {searchQuery.trim()
                ? `No songs matched "${searchQuery}"`
                : 'Your Library is currently empty'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {searchQuery.trim()
                ? 'Try clearing the search filter or searching for a different keyword.'
                : 'Upload a song in Staging and run the AI separator to see your isolated Vocals and Instrumental stems here.'}
            </p>
          </div>

          {searchQuery.trim() ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition cursor-pointer"
            >
              Clear Search
            </button>
          ) : (
            onNavigateToStaging && (
              <button
                type="button"
                onClick={onNavigateToStaging}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/20 transition cursor-pointer"
              >
                <FolderPlus className="w-4 h-4" />
                Go to Staging
              </button>
            )
          )}
        </div>
      )}

      {/* Library Items List */}
      {items.length > 0 && (
        <div className="space-y-4">
          {items.map((item) => (
            <LibraryItemCard
              key={item.id}
              item={item}
              onRename={handleRename}
              onRequestDelete={setItemToDelete}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(itemToDelete)}
        title="Delete Song from Library?"
        message={
          itemToDelete
            ? `Are you sure you want to permanently delete "${itemToDelete.displayName}"? This will remove both the Vocals and Instrumental audio files from your computer's disk.`
            : ''
        }
        confirmLabel="Delete Permanently"
        isBusy={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isDeleting) setItemToDelete(null);
        }}
      />
    </div>
  );
}
