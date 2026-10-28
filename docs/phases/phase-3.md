# Phase 3: Backend Foundation and CRUD (Without Audio Processing Yet)

**Status:** Complete — Ready for User Verification  
**Date:** 2026-10-22

---

## 1. What Was Built & Why

1. **Database Setup & Transactional Migrations (`node:sqlite`):**
   - Created [`backend/src/db/migrations.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/db/migrations.js) and [`backend/src/db/index.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/db/index.js).
   - Configured SQLite with `PRAGMA journal_mode = WAL;` (Write-Ahead Logging for concurrency and crash safety) and `PRAGMA foreign_keys = ON;`.
   - Built a lightweight, zero-dependency migration runner that tracks applied migrations in `schema_migrations` and creates the 3 core tables (`staged_files`, `library_entries`, and `jobs`).
2. **Startup Recovery (`recoverInterruptedJobsAndCleanupTemp`):**
   - On server startup, any job left in `'queued'` or `'running'` state from an unexpected stop/restart is automatically marked `'failed'` (`error_code = 'INTERRUPTED_BY_RESTART'`) with a clear human-readable message, and any leftover `job-*` folders inside `storage/temp/` are deleted from disk.
3. **Windows-Safe Naming & Duplicate Handling ([`backend/src/utils/naming.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/utils/naming.js)):**
   - Strips Windows-forbidden characters (`< > : " / \ | ? *` and control characters), blocks Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`), and resolves duplicate display names case-insensitively by appending `(2)`, `(3)`, etc.
4. **Library CRUD Service, Controller & Routes:**
   - Created [`backend/src/services/libraryService.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/services/libraryService.js), [`backend/src/controllers/libraryController.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/controllers/libraryController.js), and [`backend/src/routes/libraryRoutes.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/routes/libraryRoutes.js).
   - Enforces path traversal protection (`resolveSafeLibraryFilePath`) so no stem path can ever escape `storage/library/`.
   - Implements Create (`POST /api/library`), Read/Search (`GET /api/library`, `GET /api/library/:id`), Stream/Download (`GET /api/library/:id/audio/:stem`), Update (`PATCH /api/library/:id`), and Delete (`DELETE /api/library/:id` — deletes both the SQLite row and the audio files on disk).
5. **Automated Test Suite ([`backend/test/library.test.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/test/library.test.js)):**
   - Added 8 comprehensive integration subtests exercising every CRUD endpoint, Windows character sanitization, duplicate `(2)`/`(3)` numbering, stem streaming/downloading, path traversal rejection (`400 INVALID_PATH`), `404` handling, disk file deletion on `DELETE`, and startup job recovery.

---

## 2. Files Created or Updated in Phase 3

- **Database:** [`backend/src/db/migrations.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/db/migrations.js), [`backend/src/db/index.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/db/index.js)
- **Utilities:** [`backend/src/utils/errors.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/utils/errors.js), [`backend/src/utils/naming.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/utils/naming.js)
- **Services, Controllers & Routes:** [`backend/src/services/libraryService.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/services/libraryService.js), [`backend/src/controllers/libraryController.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/controllers/libraryController.js), [`backend/src/routes/libraryRoutes.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/routes/libraryRoutes.js), [`backend/src/index.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/index.js)
- **Tests:** [`backend/test/library.test.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/test/library.test.js)
- **Documentation:** [`docs/data-model.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/data-model.md), [`docs/api.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/api.md), [`docs/phases/phase-3.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/phases/phase-3.md)

---

## 3. How to Verify Phase 3

1. **Run the automated test suite:**
   ```powershell
   npm --prefix backend test
   ```
   *Expected:* 10/10 tests pass (`health.test.js` + all 8 subtests in `library.test.js`).
2. **Exercise the CRUD endpoints manually** using the PowerShell commands in the Phase 3 Verification Checklist (or [`docs/api.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/api.md)).

---

## 4. Known Limitations in Phase 3

- Audio file upload, staging management, and spawning `separator/separate.py` via the 1-at-a-time job queue are built next in **Phase 4**.
