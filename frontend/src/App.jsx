import React, { useEffect, useState, useCallback } from 'react';
import {
  fetchBackendHealth,
  fetchLibraryEntries,
  fetchStagedFiles,
  fetchJobs,
} from './api/client';
import { useTheme } from './hooks/useTheme';
import Layout from './components/Layout';
import LibraryPage from './pages/LibraryPage';
import StagingPage from './pages/StagingPage';
import ProcessPage from './pages/ProcessPage';
import DiscoverPage from './pages/DiscoverPage';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('library');

  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const [libraryCount, setLibraryCount] = useState(0);
  const [stagingCount, setStagingCount] = useState(0);
  const [activeJobsCount, setActiveJobsCount] = useState(0);

  // Track which staged song was clicked for separation
  const [selectedStagedFileId, setSelectedStagedFileId] = useState(null);

  const checkHealthAndCounts = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const [healthData, libData, stagedData, jobsData] = await Promise.all([
        fetchBackendHealth(),
        fetchLibraryEntries(''),
        fetchStagedFiles(),
        fetchJobs(),
      ]);
      setHealth(healthData);
      setLibraryCount((libData.items || []).length);
      setStagingCount((stagedData.items || []).length);
      setActiveJobsCount(
        (jobsData.items || []).filter(
          (j) => j.status === 'queued' || j.status === 'running'
        ).length
      );
    } catch (err) {
      setHealth(null);
      setHealthError(
        err.message ||
          'Could not connect to the local backend server on 127.0.0.1:3001.'
      );
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealthAndCounts();
  }, [checkHealthAndCounts]);

  const handleSelectSongForProcess = useCallback((stagedItem) => {
    if (stagedItem?.id) {
      setSelectedStagedFileId(stagedItem.id);
    }
    setActiveTab('process');
  }, []);

  const handleStagedTrackAdded = useCallback(() => {
    setStagingCount((prev) => prev + 1);
  }, []);

  const handleProcessCountsChange = useCallback(
    async ({ stagedCount: nextStagedCount, activeJobsCount: nextActiveCount, completedAdded }) => {
      if (typeof nextStagedCount === 'number') {
        setStagingCount(nextStagedCount);
      }
      if (typeof nextActiveCount === 'number') {
        setActiveJobsCount(nextActiveCount);
      }
      if (completedAdded) {
        try {
          const libData = await fetchLibraryEntries('');
          setLibraryCount((libData.items || []).length);
        } catch {
          // Ignore silent refresh error
        }
      }
    },
    []
  );

  return (
    <Layout
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      theme={theme}
      onToggleTheme={toggleTheme}
      health={health}
      healthError={healthError}
      healthLoading={healthLoading}
      onRefreshHealth={checkHealthAndCounts}
      libraryCount={libraryCount}
      stagingCount={stagingCount}
      activeJobsCount={activeJobsCount}
    >
      {activeTab === 'library' && (
        <LibraryPage
          onCountChange={setLibraryCount}
          onNavigateToStaging={() => setActiveTab('staging')}
        />
      )}

      {activeTab === 'staging' && (
        <StagingPage
          onCountChange={setStagingCount}
          onSelectSongForProcess={handleSelectSongForProcess}
        />
      )}

      {activeTab === 'process' && (
        <ProcessPage
          selectedStagedFileId={selectedStagedFileId}
          onSelectStagedFileId={setSelectedStagedFileId}
          onNavigateToStaging={() => setActiveTab('staging')}
          onNavigateToLibrary={() => setActiveTab('library')}
          onCountsChange={handleProcessCountsChange}
        />
      )}

      {activeTab === 'discover' && (
        <DiscoverPage
          onStagedTrackAdded={handleStagedTrackAdded}
          onNavigateToStaging={() => setActiveTab('staging')}
          onSelectSongForProcess={handleSelectSongForProcess}
        />
      )}
    </Layout>
  );
}
