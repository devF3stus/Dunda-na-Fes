import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Cpu,
  FileAudio,
  Sparkles,
  Edit3,
  Play,
  Square,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  FolderPlus,
  RefreshCw,
  Layers,
  XCircle,
} from 'lucide-react';
import {
  fetchStagedFiles,
  fetchJobs,
  createSeparationJob,
  cancelSeparationJob,
} from '../api/client';

const AVAILABLE_MODELS = [
  {
    id: 'UVR-MDX-NET-Inst_HQ_3.onnx',
    label: 'UVR-MDX-NET-Inst_HQ_3 (Recommended Default)',
    description:
      'High-quality instrumental & vocal separator. Eliminates background vocal bleed in the instrumental stem.',
  },
  {
    id: 'Kim_Vocal_2.onnx',
    label: 'Kim_Vocal_2 (Fallback Model)',
    description:
      'Vocal-focused MDX-Net model. Fast and crisp lead vocal isolation.',
  },
];

/**
 * Client-side preview of Windows filename sanitization (mirrors backend/src/utils/naming.js)
 * so the user can see how their custom name will look before submitting.
 */
function previewSanitizedName(raw) {
  const cleaned = String(raw || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim();
  return cleaned || 'Untitled Track';
}

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds < 0) {
    return '--:--';
  }
  const totalSec = Math.round(seconds);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatElapsedSeconds(startedAtIso, completedAtIso, nowMs) {
  if (!startedAtIso) return null;
  const startMs = new Date(startedAtIso).getTime();
  const endMs = completedAtIso ? new Date(completedAtIso).getTime() : nowMs;
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  const diffSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getStageLabel(stage, status) {
  if (status === 'queued') return 'Queued (Waiting in line)';
  if (status === 'completed') return 'Separation Complete';
  if (status === 'cancelled') return 'Cancelled by User';
  if (status === 'failed') return 'Separation Failed';

  switch (stage) {
    case 'starting':
      return 'Starting Python Engine';
    case 'loading_model':
      return 'Loading ONNX AI Model';
    case 'separating':
      return 'Separating Audio Chunks';
    case 'exporting':
      return 'Saving Vocals & Instrumental Stems';
    default:
      return 'Processing Audio';
  }
}

export default function ProcessPage({
  selectedStagedFileId,
  onSelectStagedFileId,
  onNavigateToStaging,
  onNavigateToLibrary,
  onCountsChange,
}) {
  const [stagedFiles, setStagedFiles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state for starting a new job
  const [nameMode, setNameMode] = useState('suggested'); // 'suggested' | 'custom'
  const [customNameInput, setCustomNameInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingJobId, setCancellingJobId] = useState(null);

  // Live ticker for elapsed time on running jobs
  const [nowMs, setNowMs] = useState(() => Date.now());
  const prevActiveCountRef = useRef(0);

  const loadData = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const [stagedData, jobsData] = await Promise.all([
          fetchStagedFiles(),
          fetchJobs(),
        ]);
        const stagedList = stagedData.items || [];
        const jobsList = jobsData.items || [];

        setStagedFiles(stagedList);
        setJobs(jobsList);

        const activeJobsCount = jobsList.filter(
          (j) => j.status === 'queued' || j.status === 'running'
        ).length;

        if (onCountsChange) {
          onCountsChange({
            stagedCount: stagedList.length,
            activeJobsCount,
            completedAdded:
              prevActiveCountRef.current > 0 && activeJobsCount === 0,
          });
        }
        prevActiveCountRef.current = activeJobsCount;
      } catch (err) {
        if (!silent) {
          setError(err.message || 'Failed to load processing queue.');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [onCountsChange]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-select the first staged file if none is selected (or if the selected one was processed/removed)
  useEffect(() => {
    if (stagedFiles.length === 0) {
      return;
    }
    const stillExists = stagedFiles.some(
      (f) => f.id === selectedStagedFileId
    );
    if (!selectedStagedFileId || !stillExists) {
      onSelectStagedFileId(stagedFiles[0].id);
    }
  }, [stagedFiles, selectedStagedFileId, onSelectStagedFileId]);

  const selectedSong =
    stagedFiles.find((f) => f.id === selectedStagedFileId) || null;

  // Reset custom name input when switching songs
  useEffect(() => {
    if (selectedSong) {
      setCustomNameInput(selectedSong.suggestedName || '');
    }
  }, [selectedSong?.id]);

  // Determine if any job is currently active ('queued' or 'running')
  const hasActiveJobs = jobs.some(
    (j) => j.status === 'queued' || j.status === 'running'
  );

  // Poll /api/jobs & /api/staging every 1.5s while any job is active
  useEffect(() => {
    if (!hasActiveJobs) return undefined;

    const pollTimer = setInterval(() => {
      loadData({ silent: true });
      setNowMs(Date.now());
    }, 1500);

    const clockTimer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(pollTimer);
      clearInterval(clockTimer);
    };
  }, [hasActiveJobs, loadData]);

  const handleStartSeparation = async (e) => {
    e.preventDefault();
    if (!selectedSong) return;

    const finalName =
      nameMode === 'custom'
        ? previewSanitizedName(customNameInput)
        : selectedSong.suggestedName;

    setSubmitting(true);
    setError(null);
    try {
      await createSeparationJob({
        stagedFileId: selectedSong.id,
        customName: finalName,
        modelName: selectedModel,
      });
      await loadData({ silent: true });
    } catch (err) {
      setError(err.message || 'Could not start separation job.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelJob = async (jobId) => {
    setCancellingJobId(jobId);
    setError(null);
    try {
      await cancelSeparationJob(jobId);
      await loadData({ silent: true });
    } catch (err) {
      setError(err.message || 'Could not cancel job.');
    } finally {
      setCancellingJobId(null);
    }
  };

  // Check if the currently selected staged song already has an active job
  const selectedSongActiveJob = selectedSong
    ? jobs.find(
        (j) =>
          j.stagedFileId === selectedSong.id &&
          (j.status === 'queued' || j.status === 'running')
      )
    : null;

  const activeJobs = jobs.filter(
    (j) => j.status === 'queued' || j.status === 'running'
  );
  const recentJobs = jobs.filter(
    (j) => j.status !== 'queued' && j.status !== 'running'
  );

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Process &amp; Separation Queue
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Configure output naming and run local AI vocal &amp; instrumental separation. Jobs run one at a time on your CPU.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadData()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium transition cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Status</span>
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-200 text-sm"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Action Could Not Be Completed</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs font-semibold underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Active Jobs Live Progress Section */}
      {activeJobs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600" />
            </span>
            <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Active Separation Queue ({activeJobs.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {activeJobs.map((job) => {
              const progressPct = Math.min(
                100,
                Math.max(0, Math.round(job.progress || 0))
              );
              const elapsed = formatElapsedSeconds(
                job.startedAt,
                job.completedAt,
                nowMs
              );

              return (
                <div
                  key={job.id}
                  className="rounded-2xl bg-white dark:bg-slate-900 border-2 border-indigo-500/40 dark:border-indigo-500/50 p-6 shadow-md shadow-indigo-500/5 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            job.status === 'running'
                              ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {job.status === 'running' ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          <span>{getStageLabel(job.stage, job.status)}</span>
                        </span>

                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          Model: {job.modelName}
                        </span>

                        {elapsed && (
                          <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                            <Clock className="w-3 h-3 text-indigo-500" />
                            <span>Elapsed: {elapsed}</span>
                          </span>
                        )}
                      </div>

                      <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                        {job.customName || 'Untitled Track'}
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {job.message || 'Preparing separation...'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCancelJob(job.id)}
                      disabled={cancellingJobId === job.id}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-600 text-rose-600 hover:text-white dark:text-rose-300 border border-rose-500/30 transition cursor-pointer self-start sm:self-center shrink-0"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>
                        {cancellingJobId === job.id
                          ? 'Cancelling...'
                          : 'Cancel Job'}
                      </span>
                    </button>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-600 dark:text-slate-400">
                        {job.status === 'queued'
                          ? 'Waiting for current job to finish...'
                          : 'Real-time ONNX Chunk Progress'}
                      </span>
                      <span className="font-mono text-indigo-600 dark:text-indigo-400">
                        {progressPct}%
                      </span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New Separation Job Configuration Card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <div className="flex items-center gap-2.5 pb-4 mb-6 border-b border-slate-100 dark:border-slate-800">
          <Cpu className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Configure New Separation Job
          </h3>
        </div>

        {stagedFiles.length === 0 ? (
          <div className="text-center py-8 max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
              <FolderPlus className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                No Staged Songs Available
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Upload a song to your Staging area first, then come back here to separate it into vocals and instrumental stems.
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateToStaging}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Go to Staging Area</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleStartSeparation} className="space-y-6">
            {/* Step 1: Select Staged Song */}
            <div className="space-y-2.5">
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                1. Choose a Staged Song ({stagedFiles.length} available)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {stagedFiles.map((file) => {
                  const isSelected = file.id === selectedSong?.id;
                  const isQueuedOrRunning = jobs.some(
                    (j) =>
                      j.stagedFileId === file.id &&
                      (j.status === 'queued' || j.status === 'running')
                  );

                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => onSelectStagedFileId(file.id)}
                      className={`text-left p-3.5 rounded-xl border transition flex items-start gap-3 cursor-pointer ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-500/10 dark:border-indigo-400 dark:bg-indigo-500/15'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40'
                      }`}
                    >
                      <FileAudio
                        className={`w-5 h-5 shrink-0 mt-0.5 ${
                          isSelected
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : 'text-slate-400'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {file.originalName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Duration: {formatDuration(file.durationSeconds)}
                          {isQueuedOrRunning && (
                            <span className="ml-2 text-indigo-600 dark:text-indigo-400 font-semibold">
                              • In Queue
                            </span>
                          )}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Naming Choice (Suggested vs Custom) */}
            {selectedSong && (
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                  2. Name the Separated Result
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option A: Accept Suggested Name */}
                  <button
                    type="button"
                    onClick={() => setNameMode('suggested')}
                    className={`text-left p-4 rounded-xl border transition cursor-pointer ${
                      nameMode === 'suggested'
                        ? 'border-indigo-600 bg-indigo-500/10 dark:border-indigo-400 dark:bg-indigo-500/15'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Use Suggested Name</span>
                    </div>
                    <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white truncate">
                      {selectedSong.suggestedName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Automatically cleaned from "{selectedSong.originalName}"
                    </p>
                  </button>

                  {/* Option B: Type Custom Name */}
                  <button
                    type="button"
                    onClick={() => setNameMode('custom')}
                    className={`text-left p-4 rounded-xl border transition cursor-pointer ${
                      nameMode === 'custom'
                        ? 'border-indigo-600 bg-indigo-500/10 dark:border-indigo-400 dark:bg-indigo-500/15'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Type a Custom Name</span>
                    </div>
                    <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white truncate">
                      {nameMode === 'custom'
                        ? previewSanitizedName(customNameInput)
                        : 'Click to customize track title...'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Sanitized automatically for Windows file safety
                    </p>
                  </button>
                </div>

                {nameMode === 'custom' && (
                  <div className="pt-2 space-y-1.5">
                    <label
                      htmlFor="custom-track-name"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Custom Display Name:
                    </label>
                    <input
                      id="custom-track-name"
                      type="text"
                      value={customNameInput}
                      onChange={(e) => setCustomNameInput(e.target.value)}
                      placeholder="Enter custom song name..."
                      maxLength={120}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Saved as:{' '}
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                        {previewSanitizedName(customNameInput)}
                      </span>{' '}
                      (duplicates automatically append{' '}
                      <code className="font-mono">(2)</code>,{' '}
                      <code className="font-mono">(3)</code>)
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Select AI Model */}
            <div className="space-y-2.5">
              <label
                htmlFor="model-select"
                className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
              >
                3. Separation AI Model
              </label>
              <select
                id="model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {
                  AVAILABLE_MODELS.find((m) => m.id === selectedModel)
                    ?.description
                }
              </p>
            </div>

            {/* Submit Button */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {selectedSongActiveJob ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    This song is already in the active separation queue above.
                  </span>
                ) : (
                  <span>
                    Staged file will be automatically cleaned up once both stems are saved to your Library.
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={
                  !selectedSong ||
                  submitting ||
                  Boolean(selectedSongActiveJob)
                }
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:pointer-events-none text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {submitting
                    ? 'Starting Job...'
                    : hasActiveJobs
                    ? 'Add to Separation Queue'
                    : 'Start Separation'}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Recent / Completed / Failed Jobs History */}
      {recentJobs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Recent Separation Jobs ({recentJobs.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {recentJobs.map((job) => {
              const isCompleted = job.status === 'completed';
              const isCancelled = job.status === 'cancelled';
              const durationStr = formatElapsedSeconds(
                job.startedAt,
                job.completedAt,
                nowMs
              );

              return (
                <div
                  key={job.id}
                  className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isCompleted
                      ? 'bg-emerald-500/5 border-emerald-500/25 dark:bg-emerald-500/10'
                      : isCancelled
                      ? 'bg-slate-100/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800'
                      : 'bg-rose-500/5 border-rose-500/25 dark:bg-rose-500/10'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    ) : isCancelled ? (
                      <XCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    )}

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {job.customName || 'Untitled Track'}
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            isCompleted
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : isCancelled
                              ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          {getStageLabel(job.stage, job.status)}
                        </span>
                        {durationStr && (
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            • Processed in {durationStr}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {isCompleted
                          ? job.message ||
                            'Vocals and instrumental stems saved to your Library.'
                          : job.errorMessage ||
                            job.message ||
                            'Job did not complete.'}
                      </p>
                    </div>
                  </div>

                  {isCompleted && (
                    <button
                      type="button"
                      onClick={onNavigateToLibrary}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer shrink-0 self-start sm:self-center"
                    >
                      <span>Listen in Library</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
