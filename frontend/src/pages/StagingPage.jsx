import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  UploadCloud,
  FileAudio,
  Clock,
  HardDrive,
  ShieldCheck,
  Cpu,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  FolderPlus,
  X,
} from 'lucide-react';
import {
  fetchStagedFiles,
  uploadAudioToStaging,
  deleteStagedFile,
  getStagedAudioPreviewUrl,
} from '../api/client';
import ConfirmModal from '../components/ConfirmModal';

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds < 0) {
    return '--:--';
  }
  const totalSec = Math.round(seconds);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) {
    return '--';
  }
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export default function StagingPage({
  onCountChange,
  onSelectSongForProcess,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState('');
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const fileInputRef = useRef(null);

  // Delete confirmation modal state
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadStagedFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStagedFiles();
      const list = data.items || [];
      setItems(list);
      if (onCountChange) {
        onCountChange(list.length);
      }
    } catch (err) {
      setError(err.message || 'Failed to load staged songs.');
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    loadStagedFiles();
  }, [loadStagedFiles]);

  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploadError(null);
    setUploadSuccess(null);

    if (file.size === 0) {
      setUploadError(
        `The file "${file.name}" is empty (0 bytes). Please choose a valid audio file.`
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const maxBytes = 100 * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadError(
        `The file "${file.name}" (${formatFileSize(
          file.size
        )}) exceeds the maximum allowed size of 100 MB.`
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    setUploadingFileName(file.name);

    try {
      const res = await uploadAudioToStaging(file, 'Personal Local File');
      const created = res.item;
      setUploadSuccess(
        `"${created.originalName}" uploaded and validated (${formatDuration(
          created.durationSeconds
        )}, ${formatFileSize(created.sizeBytes)}).`
      );
      await loadStagedFiles();
    } catch (err) {
      setUploadError(
        err.message ||
          'Upload failed. Ensure the file is a valid MP3, WAV, FLAC, M4A, or OGG audio file.'
      );
    } finally {
      setUploading(false);
      setUploadingFileName('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (uploading) return;

    const file = e.dataTransfer?.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteStagedFile(itemToDelete.id);
      setItemToDelete(null);
      await loadStagedFiles();
    } catch (err) {
      setError(err.message || 'Could not remove staged song.');
      setItemToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Staging Area
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Upload audio files from your computer or review tracks downloaded from Discover before running AI vocal separation.
          </p>
        </div>

        <button
          type="button"
          onClick={loadStagedFiles}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium transition cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Drag & Drop Upload Box */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload audio file to Staging (click or drag and drop)"
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
          isDragging
            ? 'border-indigo-500 bg-indigo-500/10'
            : uploading
            ? 'border-indigo-400/50 bg-slate-100/70 dark:bg-slate-900/50 cursor-wait'
            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/70 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-500/5'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.flac,.m4a,.ogg,audio/*"
          onChange={handleFileInputChange}
          className="hidden"
          disabled={uploading}
          aria-hidden="true"
        />

        <div className="max-w-md mx-auto space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            {uploading ? (
              <RefreshCw className="w-7 h-7 animate-spin" />
            ) : (
              <UploadCloud className="w-7 h-7" />
            )}
          </div>

          {uploading ? (
            <div className="space-y-1">
              <p className="text-base font-semibold text-slate-900 dark:text-white">
                Validating &amp; staging "{uploadingFileName}"...
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspecting binary file signature and probing duration via FFprobe
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                  Click to choose an audio file or drag &amp; drop here
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Supported formats:{' '}
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                    MP3, WAV, FLAC, M4A, OGG
                  </span>{' '}
                  • Max 100 MB (validated by binary magic-byte header)
                </p>
              </div>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition">
                  <UploadCloud className="w-4 h-4" />
                  <span>Select Audio File</span>
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Upload Feedback Banners */}
      {uploadError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-200 text-sm"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Upload Rejected</p>
              <p className="mt-0.5">{uploadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            aria-label="Dismiss upload error"
            className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {uploadSuccess && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-sm"
        >
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Song Added to Staging</p>
              <p className="mt-0.5">{uploadSuccess}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUploadSuccess(null)}
            aria-label="Dismiss upload notice"
            className="p-1 rounded-lg hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* General Error Banner */}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-200 text-sm"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="p-1 rounded-lg hover:bg-rose-500/20 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Staged Songs List */}
      {loading && items.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
          <RefreshCw className="w-7 h-7 text-indigo-500 animate-spin mx-auto" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Loading staged songs...
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-12 text-center max-w-xl mx-auto space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
            <FolderPlus className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            No Songs in Staging Yet
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Upload an audio file above (such as MP3, WAV, FLAC, M4A, or OGG) to inspect its duration and prepare it for vocal separation.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Staged Songs Ready for Separation ({items.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-5 shadow-xs transition hover:border-slate-300 dark:hover:border-slate-700"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left Info */}
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                        <FileAudio className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4
                          className="text-base font-bold text-slate-900 dark:text-white truncate"
                          title={item.originalName}
                        >
                          {item.originalName}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Suggested clean name:{' '}
                          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                            {item.suggestedName}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Metadata Pills */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-medium">
                        <Clock className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Duration: {formatDuration(item.durationSeconds)}</span>
                      </span>

                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-medium">
                        <HardDrive className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Size: {formatFileSize(item.sizeBytes)}</span>
                      </span>

                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-medium">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                        <span>
                          {item.source === 'discover' ? 'Discover' : 'Local Upload'} •{' '}
                          {item.licenseInfo}
                        </span>
                      </span>

                      {item.createdAt && (
                        <span className="text-slate-400 dark:text-slate-500 pl-1">
                          Staged {formatDate(item.createdAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectSongForProcess(item)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/20 transition cursor-pointer"
                    >
                      <Cpu className="w-4 h-4" />
                      <span>Separate</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setItemToDelete(item)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-rose-500/10 dark:bg-slate-800/60 dark:hover:bg-rose-500/15 text-slate-700 hover:text-rose-600 dark:text-slate-300 dark:hover:text-rose-400 hover:border-rose-500/30 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>

                {/* Inline Audio Preview */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center gap-3">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
                    Preview Staged Original:
                  </span>
                  <audio
                    controls
                    preload="none"
                    src={getStagedAudioPreviewUrl(item.id)}
                    className="h-9 w-full max-w-md"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Modal for Removing a Staged Song */}
      <ConfirmModal
        isOpen={Boolean(itemToDelete)}
        title="Remove Staged Song?"
        message={
          itemToDelete
            ? `Are you sure you want to remove "${itemToDelete.originalName}" from Staging? Its staged audio file will be deleted from local storage.`
            : ''
        }
        confirmLabel="Remove Song"
        isDanger
        isLoading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => !deleting && setItemToDelete(null)}
      />
    </div>
  );
}
