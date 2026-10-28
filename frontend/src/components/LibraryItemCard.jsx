import React, { useState } from 'react';
import {
  Mic,
  Music2,
  Download,
  Pencil,
  Trash2,
  Check,
  X,
  Clock,
  Shield,
  Cpu,
  Calendar,
  FileAudio,
} from 'lucide-react';
import { getStemDownloadUrl } from '../api/client';

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) {
    return '—';
  }
  const totalSec = Math.max(0, Math.round(Number(seconds)));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export default function LibraryItemCard({
  item,
  onRename,
  onRequestDelete,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(item.displayName);
  const [draftNotes, setDraftNotes] = useState(item.notes || '');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState(null);

  const startEditing = () => {
    setDraftName(item.displayName);
    setDraftNotes(item.notes || '');
    setEditError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditError(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) {
      setEditError('Display name cannot be empty.');
      return;
    }

    setSaving(true);
    setEditError(null);
    try {
      await onRename(item.id, {
        displayName: trimmed,
        notes: draftNotes.trim(),
      });
      setIsEditing(false);
    } catch (err) {
      setEditError(err.message || 'Could not rename Library entry.');
    } finally {
      setSaving(false);
    }
  };

  const vocalsStreamUrl = item.audioUrls?.vocals || `/api/library/${item.id}/audio/vocals`;
  const instStreamUrl =
    item.audioUrls?.instrumental || `/api/library/${item.id}/audio/instrumental`;

  return (
    <article className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-md transition p-6 space-y-5">
      {/* Top Row: Title / Inline Edit Form + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {!isEditing ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                  {item.displayName}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                    item.source === 'discover'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-700 dark:text-indigo-300'
                  }`}
                >
                  <Shield className="w-3 h-3" />
                  {item.licenseInfo || 'Personal Local File'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <FileAudio className="w-3.5 h-3.5" />
                  Original: {item.originalName}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDuration(item.durationSeconds)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5" />
                  {item.modelUsed}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(item.createdAt)}
                </span>
              </div>

              {item.notes && (
                <p className="text-xs italic text-slate-600 dark:text-slate-300 pt-1">
                  “{item.notes}”
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-3 max-w-xl">
              <div>
                <label
                  htmlFor={`rename-input-${item.id}`}
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
                >
                  Display Name
                </label>
                <input
                  id={`rename-input-${item.id}`}
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  disabled={saving}
                  autoFocus
                  className="w-full px-3.5 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor={`notes-input-${item.id}`}
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
                >
                  Notes (Optional)
                </label>
                <input
                  id={`notes-input-${item.id}`}
                  type="text"
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  disabled={saving}
                  placeholder="Add a note (e.g. key, tempo, or mix notes)..."
                  className="w-full px-3.5 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {editError && (
                <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  {editError}
                </p>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border border-slate-300 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Action Buttons (Rename & Delete) */}
        {!isEditing && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-800 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              Rename
            </button>
            <button
              type="button"
              onClick={() => onRequestDelete(item)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Dual Stem Players & Separate Download Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/80">
        {/* Vocals Stem Card */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                <Mic className="w-4 h-4" />
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Vocals Stem
              </span>
            </div>

            <a
              href={getStemDownloadUrl(item.id, 'vocals')}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition"
            >
              <Download className="w-3.5 h-3.5" />
              Download Vocals
            </a>
          </div>

          <audio
            controls
            preload="metadata"
            src={vocalsStreamUrl}
            className="w-full h-9"
          >
            Your browser does not support the HTML5 audio element.
          </audio>
        </div>

        {/* Instrumental Stem Card */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Music2 className="w-4 h-4" />
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Instrumental Stem
              </span>
            </div>

            <a
              href={getStemDownloadUrl(item.id, 'instrumental')}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition"
            >
              <Download className="w-3.5 h-3.5" />
              Download Instrumental
            </a>
          </div>

          <audio
            controls
            preload="metadata"
            src={instStreamUrl}
            className="w-full h-9"
          >
            Your browser does not support the HTML5 audio element.
          </audio>
        </div>
      </div>
    </article>
  );
}
