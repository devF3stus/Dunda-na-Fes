import React, { useState } from 'react';
import {
  Compass,
  Search,
  ShieldCheck,
  Clock,
  HardDrive,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Music,
  Cpu,
  FolderPlus,
  Globe,
} from 'lucide-react';
import { searchDiscoverTracks, stageDiscoveredTrack } from '../api/client';

const SOURCE_OPTIONS = [
  {
    id: 'both',
    label: 'Both Catalogues',
    description: 'Internet Archive + Wikimedia Commons',
  },
  {
    id: 'archive',
    label: 'Internet Archive',
    description: 'archive.org Public Domain & CC audio',
  },
  {
    id: 'wikimedia',
    label: 'Wikimedia Commons',
    description: 'commons.wikimedia.org free media',
  },
];

const QUICK_SEARCHES = [
  'gospel vocal',
  'jazz vocal',
  'blues song',
  'acoustic folk song',
  'classical soprano',
];

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds <= 0) {
    return null;
  }
  const totalSec = Math.round(seconds);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes <= 0) {
    return null;
  }
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export default function DiscoverPage({
  onStagedTrackAdded,
  onNavigateToStaging,
  onSelectSongForProcess,
}) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('both');
  const [results, setResults] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // Per-track download/staging state: { [track.id]: { status: 'downloading' | 'staged' | 'error', stagedItem?, error? } }
  const [stagingStateById, setStagingStateById] = useState({});

  const executeSearch = async (searchQuery, searchSource = source) => {
    const trimmed = String(searchQuery || '').trim();
    if (!trimmed) {
      setSearchError('Please enter a search keyword (for example: gospel, jazz, blues, folk).');
      return;
    }

    setSearching(true);
    setSearchError(null);
    setWarnings([]);

    try {
      const data = await searchDiscoverTracks(trimmed, searchSource, 10);
      setResults(data.items || []);
      setWarnings(data.warnings || []);
      setHasSearched(true);
    } catch (err) {
      setSearchError(
        err.message ||
          'Could not search open music catalogues right now. Please check your internet connection and try again.'
      );
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executeSearch(query, source);
  };

  const handleQuickSearch = (preset) => {
    setQuery(preset);
    executeSearch(preset, source);
  };

  const handleAddToStaging = async (track) => {
    setStagingStateById((prev) => ({
      ...prev,
      [track.id]: { status: 'downloading', error: null },
    }));

    try {
      const res = await stageDiscoveredTrack({
        title: track.title,
        artist: track.artist,
        audioUrl: track.audioUrl,
        licenseInfo: track.licenseInfo,
      });

      const stagedItem = res.item;
      setStagingStateById((prev) => ({
        ...prev,
        [track.id]: { status: 'staged', stagedItem, error: null },
      }));

      if (onStagedTrackAdded) {
        onStagedTrackAdded(stagedItem);
      }
    } catch (err) {
      setStagingStateById((prev) => ({
        ...prev,
        [track.id]: {
          status: 'error',
          error:
            err.message ||
            'Could not download and validate this track into Staging.',
        },
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Discover Openly Licensed Music
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Search verified Public Domain and Creative Commons catalogues (Internet Archive &amp; Wikimedia Commons), preview tracks, inspect per-track licenses, and import directly into Staging.
          </p>
        </div>
      </div>

      {/* Search & Source Filter Card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
        {/* Source Toggle Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">
            Legal Source:
          </span>
          {SOURCE_OPTIONS.map((opt) => {
            const active = source === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setSource(opt.id);
                  if (hasSearched && query.trim()) {
                    executeSearch(query, opt.id);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Input Bar */}
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Public Domain & Creative Commons songs (e.g., gospel, jazz vocal, blues, choir)..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white shadow-sm shadow-indigo-500/20 transition cursor-pointer shrink-0"
          >
            {searching ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Searching...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Search Catalogues</span>
              </>
            )}
          </button>
        </form>

        {/* Quick Search Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Try a quick search:
          </span>
          {QUICK_SEARCHES.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handleQuickSearch(preset)}
              disabled={searching}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 hover:bg-indigo-500/15 dark:bg-slate-800 dark:hover:bg-indigo-500/20 text-slate-700 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-300 transition cursor-pointer"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Warnings Banner (if one source timed out while the other succeeded) */}
      {warnings.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs space-y-1">
          {warnings.map((w, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search Error Banner */}
      {searchError && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-200 text-sm"
        >
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Discover Search Error</p>
            <p className="mt-0.5">{searchError}</p>
          </div>
        </div>
      )}

      {/* Results List / States */}
      {searching ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
          <RefreshCw className="w-7 h-7 text-indigo-500 animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Searching openly licensed audio catalogues and verifying per-track licenses...
          </p>
        </div>
      ) : !hasSearched ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-10 text-center max-w-2xl mx-auto space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Compass className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Explore Legal, Openly Licensed Music
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Every track found here comes from <strong>Internet Archive</strong> or{' '}
            <strong>Wikimedia Commons</strong> with an explicit Public Domain or Creative Commons license. Click a quick-search tag above or type any genre or instrument to begin.
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-10 text-center max-w-xl mx-auto space-y-2">
          <Music className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            No Openly Licensed Tracks Found
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No downloadable audio files matched "{query}". Try broader keywords like{' '}
            <code className="font-mono">gospel</code>,{' '}
            <code className="font-mono">jazz</code>, or{' '}
            <code className="font-mono">folk</code>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Verified Openly Licensed Tracks ({results.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {results.map((track) => {
              const st = stagingStateById[track.id] || {};
              const durationStr = formatDuration(track.durationSeconds);
              const sizeStr = formatFileSize(track.sizeBytes);

              return (
                <div
                  key={track.id}
                  className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    {/* Track Details & License Metadata */}
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Source Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            track.sourceId === 'archive'
                              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                              : 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20'
                          }`}
                        >
                          <Globe className="w-3 h-3" />
                          <span>{track.sourceLabel}</span>
                        </span>

                        {/* License Badge (Required by Section 6) */}
                        <a
                          href={track.licenseUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="View official license deed"
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/20 transition"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                          <span>License: {track.licenseLabel}</span>
                          <ExternalLink className="w-3 h-3 opacity-70" />
                        </a>

                        {track.format && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {track.format}
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="text-base font-bold text-slate-900 dark:text-white">
                          {track.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Artist / Creator:{' '}
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {track.artist}
                          </span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        {durationStr && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{durationStr}</span>
                          </span>
                        )}
                        {sizeStr && (
                          <span className="inline-flex items-center gap-1">
                            <HardDrive className="w-3.5 h-3.5 text-emerald-500" />
                            <span>{sizeStr}</span>
                          </span>
                        )}
                        {track.pageUrl && (
                          <a
                            href={track.pageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                          >
                            <span>Source Record</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Right Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {st.status === 'staged' && st.stagedItem ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onSelectSongForProcess(st.stagedItem)}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition cursor-pointer"
                          >
                            <Cpu className="w-4 h-4" />
                            <span>Separate Now</span>
                          </button>
                          <button
                            type="button"
                            onClick={onNavigateToStaging}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <span>In Staging</span>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddToStaging(track)}
                          disabled={st.status === 'downloading'}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white shadow-sm shadow-indigo-500/20 transition cursor-pointer"
                        >
                          {st.status === 'downloading' ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Downloading to Staging...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" />
                              <span>Add to Staging</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Per-track Download Error */}
                  {st.status === 'error' && st.error && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-200 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>{st.error}</span>
                    </div>
                  )}

                  {/* Remote Audio Preview Player */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center gap-3">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
                      Preview Track:
                    </span>
                    <audio
                      controls
                      preload="none"
                      src={track.audioUrl}
                      className="h-9 w-full max-w-md"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
