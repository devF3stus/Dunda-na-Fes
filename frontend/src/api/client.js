/**
 * Centralized HTTP client for the Dunda na Fes local backend (/api/*).
 * Always parses our standard `{ error: { code, message } }` JSON envelope
 * and throws a human-readable Error if a request fails.
 */
export async function apiRequest(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers['Content-Type']
  ) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      'Could not connect to the local backend server (127.0.0.1:3001). Make sure the backend is running.'
    );
  }

  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const friendlyMessage =
      data?.error?.message ||
      `Request failed with HTTP status ${response.status}.`;
    const err = new Error(friendlyMessage);
    err.code = data?.error?.code || `HTTP_${response.status}`;
    err.status = response.status;
    throw err;
  }

  return data;
}

// --- Health API ---
export function fetchBackendHealth() {
  return apiRequest('/api/health');
}

// --- Library CRUD API ---
export function fetchLibraryEntries(search = '') {
  const query = search.trim()
    ? `?search=${encodeURIComponent(search.trim())}`
    : '';
  return apiRequest(`/api/library${query}`);
}

export function fetchLibraryEntry(id) {
  return apiRequest(`/api/library/${encodeURIComponent(id)}`);
}

export function updateLibraryEntry(id, payload) {
  return apiRequest(`/api/library/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteLibraryEntry(id) {
  return apiRequest(`/api/library/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function getStemDownloadUrl(id, stem) {
  return `/api/library/${encodeURIComponent(id)}/audio/${encodeURIComponent(stem)}?download=1`;
}

// --- Staging API (Phase 6) ---
export function fetchStagedFiles() {
  return apiRequest('/api/staging');
}

export function uploadAudioToStaging(file, licenseInfo = 'Personal Local File') {
  const formData = new FormData();
  formData.append('file', file);
  if (licenseInfo) {
    formData.append('licenseInfo', licenseInfo);
  }
  return apiRequest('/api/staging/upload', {
    method: 'POST',
    body: formData,
  });
}

export function deleteStagedFile(id) {
  return apiRequest(`/api/staging/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function getStagedAudioPreviewUrl(id) {
  return `/api/staging/${encodeURIComponent(id)}/audio`;
}

// --- Processing Jobs API (Phase 6) ---
export function fetchJobs() {
  return apiRequest('/api/jobs');
}

export function fetchJob(id) {
  return apiRequest(`/api/jobs/${encodeURIComponent(id)}`);
}

export function createSeparationJob({ stagedFileId, customName, modelName }) {
  return apiRequest('/api/jobs', {
    method: 'POST',
    body: JSON.stringify({
      stagedFileId,
      customName,
      modelName,
    }),
  });
}

export function cancelSeparationJob(id) {
  return apiRequest(`/api/jobs/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
}

// --- Discover Openly Licensed Music API (Phase 7) ---
export function searchDiscoverTracks(query, source = 'both', limit = 10) {
  const params = new URLSearchParams({
    q: String(query || '').trim(),
    source,
    limit: String(limit),
  });
  return apiRequest(`/api/discover/search?${params.toString()}`);
}

export function stageDiscoveredTrack({
  title,
  artist,
  audioUrl,
  licenseInfo,
}) {
  return apiRequest('/api/discover/stage', {
    method: 'POST',
    body: JSON.stringify({
      title,
      artist,
      audioUrl,
      licenseInfo,
    }),
  });
}

