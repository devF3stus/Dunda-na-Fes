import React from 'react';
import {
  Music,
  Compass,
  FolderPlus,
  Cpu,
  Library,
  Sun,
  Moon,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

const NAV_ITEMS = [
  {
    id: 'discover',
    label: 'Discover',
    icon: Compass,
    badgePhase: 'Phase 7',
    description: 'Find legal & CC music',
  },
  {
    id: 'staging',
    label: 'Staging',
    icon: FolderPlus,
    badgePhase: 'Phase 6',
    description: 'Upload & prepare tracks',
  },
  {
    id: 'process',
    label: 'Process',
    icon: Cpu,
    badgePhase: 'Phase 6',
    description: 'AI stem separation queue',
  },
  {
    id: 'library',
    label: 'Library',
    icon: Library,
    badgePhase: null,
    description: 'Play & download stems',
  },
];

export default function Layout({
  activeTab,
  onSelectTab,
  theme,
  onToggleTheme,
  health,
  healthError,
  healthLoading,
  onRefreshHealth,
  libraryCount,
  stagingCount,
  activeJobsCount,
  children,
}) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-200">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800/80 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  Dunda na Fes
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  Local AI Studio
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                100% Local Vocal &amp; Instrumental Separator
              </p>
            </div>
          </div>

          {/* Right Status & Theme Controls */}
          <div className="flex items-center gap-2.5">
            {/* Backend Health Pill */}
            <button
              type="button"
              onClick={onRefreshHealth}
              title="Click to re-check backend connection"
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition cursor-pointer ${
                healthLoading
                  ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  : healthError
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {healthLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : healthError ? (
                <AlertTriangle className="w-3.5 h-3.5" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              )}
              <span>
                {healthLoading
                  ? 'Checking...'
                  : healthError
                  ? 'Backend Offline'
                  : health?.message || 'backend OK'}
              </span>
            </button>

            {/* Dark / Light Theme Toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600" />
              )}
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-200/60 dark:border-slate-800/60">
          <nav
            aria-label="Main navigation"
            className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-2"
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      isActive
                        ? 'text-white'
                        : 'text-slate-400 dark:text-slate-500 group-hover:text-indigo-500 dark:group-hover:text-indigo-400'
                    }`}
                  />
                  <span>{item.label}</span>
                  {item.id === 'staging' &&
                    typeof stagingCount === 'number' &&
                    stagingCount > 0 && (
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full font-semibold ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {stagingCount}
                      </span>
                    )}
                  {item.id === 'process' &&
                    typeof activeJobsCount === 'number' &&
                    activeJobsCount > 0 && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-semibold ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                        }`}
                      >
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>{activeJobsCount}</span>
                      </span>
                    )}
                  {item.id === 'library' && typeof libraryCount === 'number' && (
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full font-semibold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {libraryCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Global Backend Error Banner if unreachable */}
      {healthError && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div
            role="alert"
            className="flex items-center justify-between gap-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-200"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
              <div className="text-sm">
                <span className="font-semibold">Backend Connection Issue: </span>
                <span>{healthError}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onRefreshHealth}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500 transition cursor-pointer shrink-0"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/80 py-4 px-4 sm:px-6 lg:px-8 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            <strong>Dunda na Fes</strong> — Bound strictly to{' '}
            <code className="font-mono text-indigo-600 dark:text-indigo-400">
              127.0.0.1
            </code>{' '}
            (Local-only privacy guarantee)
          </span>
          {health?.models?.defaultModel && (
            <span className="font-mono">
              Model: {health.models.defaultModel}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
