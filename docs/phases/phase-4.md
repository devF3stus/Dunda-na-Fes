# Phase 4: Upload, Staging, and Processing Jobs

**Status:** Complete — Ready for User Verification  
**Date:** 2026-10-22

---

## 1. What Was Built & Why

1. **Upload Safety & Binary Magic-Byte Validation ([`backend/src/utils/audioValidation.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/utils/audioValidation.js) & [`backend/src/middleware/uploadMiddleware.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/middleware/uploadMiddleware.js)):**
   - Added `multer` (`^2.0.0`, MIT License) configured to write incoming uploads to `storage/temp/upload-<uuid>.tmp` with a strict `MAX_UPLOAD_SIZE_MB` limit.
   - Checks both the file extension (`.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`) **and** the first 64 bytes of the file on disk (`RIFF`/`WAVE`, `fLaC`, `OggS`, `ftyp`, `ID3` or MPEG frame sync). If a non-audio file is renamed to `.mp3`, it is rejected immediately (`400 INVALID_AUDIO_CONTENT`) and deleted from `storage/temp/`.
   - Uses `ffprobe` (with automatic Windows WinGet path resolution) to inspect the track's duration in seconds.
2. **Staging Service, Controller & Routes ([`backend/src/services/stagingService.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/services/stagingService.js), [`backend/src/controllers/stagingController.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/controllers/stagingController.js), [`backend/src/routes/stagingRoutes.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/routes/stagingRoutes.js)):**
   - Stores validated files in `storage/staging/<uuid>.<ext>` (never trusting client filenames on disk) and computes a clean `suggestedName` for the UI.
   - Supports listing (`GET /api/staging`), audio preview streaming (`GET /api/staging/:id/audio`), and deletion (`DELETE /api/staging/:id`), while preventing deletion of a staged file that is currently queued or running (`409 STAGED_FILE_IN_USE`).
3. **One-at-a-Time FIFO Job Queue & Python Child Process Runner ([`backend/src/jobs/jobQueue.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/jobs/jobQueue.js), [`backend/src/controllers/jobController.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/controllers/jobController.js), [`backend/src/routes/jobRoutes.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/routes/jobRoutes.js)):**
   - Runs strictly **1 job at a time**; additional jobs wait in `'queued'` status in FIFO order.
   - Spawns `separator\.venv\Scripts\python.exe separator/separate.py` targeting an isolated `storage/temp/job-<jobId>/` directory.
   - Parses every JSON line emitted on Python's `stdout` in real time using Node's `readline` interface and updates `jobs.stage`, `jobs.progress`, and `jobs.message` in SQLite.
   - **Completion Flow:** Moves `vocals.wav` and `instrumental.wav` into `storage/library/<libraryId>/`, creates the Library row (`createLibraryEntry`), marks the job `'completed'`, deletes `storage/temp/job-<jobId>/`, and removes the staged original from `storage/staging/`.
   - **Cancellation Flow (`POST /api/jobs/:id/cancel`):** Terminates the entire Python/FFmpeg process tree on Windows (`taskkill /PID <pid> /T /F`), deletes `storage/temp/job-<jobId>/`, marks the job `'cancelled'`, and preserves the staged original so the user can retry or delete it.
   - **Startup Cleanup:** Cleans up any leftover `upload-*.tmp` files and `job-*` folders in `storage/temp/` and marks interrupted jobs `'failed'` (`INTERRUPTED_BY_RESTART`).
4. **Automated Test Suite ([`backend/test/jobs.test.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/test/jobs.test.js)):**
   - Added 5 comprehensive end-to-end integration subtests covering bad file rejection (bad extension + fake magic bytes), valid WAV upload with duration inspection, full job processing -> Library creation -> staging/temp cleanup, running job cancellation, and separator failure handling.

---

## 2. Files Created or Updated in Phase 4

- **Backend Utilities & Middleware:** [`backend/src/utils/audioValidation.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/utils/audioValidation.js), [`backend/src/middleware/uploadMiddleware.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/middleware/uploadMiddleware.js)
- **Staging & Jobs Layer:** [`backend/src/services/stagingService.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/services/stagingService.js), [`backend/src/controllers/stagingController.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/controllers/stagingController.js), [`backend/src/routes/stagingRoutes.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/routes/stagingRoutes.js), [`backend/src/jobs/jobQueue.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/jobs/jobQueue.js), [`backend/src/controllers/jobController.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/controllers/jobController.js), [`backend/src/routes/jobRoutes.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/routes/jobRoutes.js), [`backend/src/index.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/index.js), [`backend/package.json`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/package.json)
- **Tests:** [`backend/test/jobs.test.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/test/jobs.test.js)
- **Documentation:** [`docs/api.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/api.md), [`docs/licenses.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/licenses.md), [`docs/phases/phase-4.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/phases/phase-4.md)
