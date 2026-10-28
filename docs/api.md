# API Reference ("Dunda na Fes")

**Last Updated:** 2026-10-22 (Phase 4 — Upload, Staging, and Processing Jobs)

All endpoints are served strictly on **`http://127.0.0.1:3001`** (and proxied via Vite at `http://127.0.0.1:5173/api/*` in development).

---

## 1. Standard Error Format

Whenever any endpoint fails, the server returns a consistent JSON object with a human-readable message and **never exposes a raw stack trace**:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Clear human-readable explanation of what went wrong."
  }
}
```

### Error Codes Reference (Phase 1–4)

| HTTP Status | `error.code` | When It Happens |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Missing required fields or empty display name on create/rename. |
| `400` | `UPLOAD_MISSING` | No file was attached in `POST /api/staging/upload`. |
| `400` | `EMPTY_FILE` | Uploaded file is 0 bytes. |
| `400` | `UNSUPPORTED_AUDIO_FORMAT` | File extension is not `.mp3`, `.wav`, `.flac`, `.m4a`, or `.ogg`. |
| `400` | `INVALID_AUDIO_CONTENT` | File's binary magic bytes do not match a valid audio header. |
| `400` | `INVALID_PATH` | A file path attempted to escape its storage folder (path traversal blocked). |
| `400` | `INVALID_STEM` | Stem parameter was not `'vocals'` or `'instrumental'`. |
| `404` | `STAGED_FILE_NOT_FOUND` | No staged file exists with the specified `id`. |
| `404` | `JOB_NOT_FOUND` | No processing job exists with the specified `id`. |
| `404` | `LIBRARY_ENTRY_NOT_FOUND` | No Library entry exists with the specified `id`. |
| `404` | `AUDIO_FILE_MISSING` | The database row exists, but the underlying audio file is missing from disk. |
| `409` | `STAGED_FILE_IN_USE` | Tried to delete a staged file while a job is actively processing it. |
| `409` | `JOB_ALREADY_ACTIVE` | Tried to queue a second job for a staged file that is already queued or running. |
| `409` | `JOB_NOT_CANCELLABLE` | Tried to cancel a job that has already finished, failed, or been cancelled. |
| `413` | `FILE_TOO_LARGE` | Uploaded file exceeds `MAX_UPLOAD_SIZE_MB` (default `100` MB). |
| `500` | `INTERNAL_ERROR` | Unexpected server error (logged to console, hidden from client). |

---

## 2. Health Endpoint (Phase 1)

### `GET /api/health`
Returns server status, SQLite readiness, and configured default/fallback models.

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:3001/api/health
```

---

## 3. Staging & Upload Endpoints (Phase 4)

### A. Upload Audio to Staging — `POST /api/staging/upload`

Accepts `multipart/form-data` with field `file` (and optional `licenseInfo`).
- Enforces `MAX_UPLOAD_SIZE_MB`.
- Validates both file extension (`.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`) and binary header magic bytes (`ID3`/MPEG frame sync, `RIFF`/`WAVE`, `fLaC`, `ftyp`, `OggS`).
- Extracts duration in seconds via `ffprobe`.
- Generates a safe UUID filename inside `storage/staging/` and derives a cleaned `suggestedName`.

#### Example Request (`curl.exe` in PowerShell)
```powershell
curl.exe -s -X POST http://127.0.0.1:3001/api/staging/upload -F "file=@storage/temp/sample_clip_15s.mp3"
```

#### Example Response (`201 Created`)
```json
{
  "item": {
    "id": "8e8a4a4c-1234-4567-89ab-cdef01234567",
    "originalName": "sample_clip_15s.mp3",
    "suggestedName": "sample clip 15s",
    "storedFilename": "8e8a4a4c-1234-4567-89ab-cdef01234567.mp3",
    "source": "upload",
    "licenseInfo": "Personal Local File",
    "sizeBytes": 240488,
    "durationSeconds": 14.98,
    "createdAt": "2026-10-22T06:45:00.000Z"
  }
}
```

---

### B. List Staged Files — `GET /api/staging`

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:3001/api/staging
```

---

### C. Stream Staged Audio Preview — `GET /api/staging/:id/audio`

Streams the staged audio file so the user can preview it before processing.

---

### D. Delete a Staged File — `DELETE /api/staging/:id`

Removes the staged file from SQLite and deletes `<storedFilename>` from `storage/staging/`. Returns `409 STAGED_FILE_IN_USE` if an active job is currently processing it.

```powershell
Invoke-RestMethod -Method Delete -Uri http://127.0.0.1:3001/api/staging/<staged-id>
```

---

## 4. Processing Jobs & Queue Endpoints (Phase 4)

### A. Start / Enqueue a Separation Job — `POST /api/jobs`

Queues a separation job for a staged file. Jobs run strictly **one at a time** in FIFO order.
- If `customName` is provided, it is sanitized for Windows; if omitted, the staged file's `suggestedName` is used.
- When the job finishes (`status = 'completed'`), the vocals and instrumental stems are moved to `storage/library/<libraryEntryId>/`, a Library entry is created automatically, the temporary `storage/temp/job-<id>/` folder is deleted, and the staged original is removed.

#### Example PowerShell Request
```powershell
$jobReq = @{
  stagedFileId = "<staged-id>"
  customName = "Swanee (15s Clip)"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/api/jobs -ContentType "application/json" -Body $jobReq
```

#### Example Response (`201 Created`)
```json
{
  "item": {
    "id": "b1234567-89ab-4cde-f012-3456789abcde",
    "stagedFileId": "8e8a4a4c-1234-4567-89ab-cdef01234567",
    "customName": "Swanee (15s Clip)",
    "modelName": "UVR-MDX-NET-Inst_HQ_3.onnx",
    "status": "queued",
    "stage": "queued",
    "progress": 0,
    "message": "Waiting in queue...",
    "errorCode": null,
    "errorMessage": null,
    "libraryEntryId": null,
    "createdAt": "2026-10-22T06:46:00.000Z",
    "startedAt": null,
    "completedAt": null
  }
}
```

---

### B. Poll Job Status & Progress — `GET /api/jobs/:id`

Returns live progress (`0` to `100`), stage (`queued`, `starting`, `loading_model`, `separating`, `exporting`, `done`, `failed`, `cancelled`), human-readable `message`, and `libraryEntryId` once complete.

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:3001/api/jobs/<job-id>
```

---

### C. List All Jobs — `GET /api/jobs`

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:3001/api/jobs
```

---

### D. Cancel a Queued or Running Job — `POST /api/jobs/:id/cancel`

Terminates the running Python separator process tree (`taskkill /PID <pid> /T /F` on Windows), cleans up the temporary working directory `storage/temp/job-<id>/`, marks the job `status = 'cancelled'`, and keeps the staged original in `storage/staging/` so you can retry or remove it.

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/api/jobs/<job-id>/cancel
```

---

## 5. Library CRUD Endpoints (Phase 3)

- `GET /api/library?search=...` — List or search Library entries.
- `POST /api/library` — Create a Library entry directly.
- `GET /api/library/:id` — Get details for a single Library entry.
- `PATCH /api/library/:id` — Rename a Library entry (`displayName`) or edit `notes`.
- `DELETE /api/library/:id` — Delete a Library entry and remove its stem files from disk.
- `GET /api/library/:id/audio/:stem` — Stream or download (`?download=1`) `vocals` or `instrumental`.

---

## 6. Discover Legal Music Endpoints (Phase 7)

### A. Search Openly Licensed Catalogues — `GET /api/discover/search`

Searches **Internet Archive** (`archive.org`), **Wikimedia Commons** (`commons.wikimedia.org`), or **both** concurrently for Public Domain and Creative Commons audio tracks.

- **Query Parameters:**
  - `q` (required): Search keywords (e.g. `gospel vocal`, `jazz`, `blues song`).
  - `source` (optional): `both` (default), `archive`, or `wikimedia`.
  - `limit` (optional): Maximum tracks to return (default `10`).

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/discover/search?q=gospel&source=both"
```

### B. Import Discovered Track into Staging — `POST /api/discover/stage`

Downloads a track from an allowlisted HTTPS domain (`archive.org`, `*.archive.org`, `upload.wikimedia.org`, `commons.wikimedia.org`) into a temporary file, validates its size (`<= MAX_UPLOAD_SIZE_MB`) and binary magic-byte header (`detectAudioFormatByMagicBytes`), probes its duration via `ffprobe`, moves it to `storage/staging/`, and inserts a `staged_files` row with `source = 'discover'` and `license_info` preserved.

```powershell
$stageBody = @{
  title = "Swing Low Sweet Chariot"
  artist = "Fisk Jubilee Quartet"
  audioUrl = "https://archive.org/download/..."
  licenseInfo = "Public Domain (Internet Archive • http://creativecommons.org/publicdomain/mark/1.0/)"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/api/discover/stage -ContentType "application/json" -Body $stageBody
```

