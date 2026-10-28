# Phase 1: Scaffolding and Wiring

**Status:** Complete — Ready for User Verification  
**Date:** 2026-10-21

---

## 1. What Was Built & Why

1. **Separated Folder Structure & `.gitignore`:**
   - Created `frontend/`, `backend/`, `separator/`, `storage/` (`staging`, `library`, `temp`, `models`, `db`), and `docs/`.
   - Added root [`.gitignore`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/.gitignore) so models, audio files, SQLite databases, `node_modules/`, `.venv/`, and `.env` files are never committed to Git.
2. **Backend Scaffolding (`backend/`):**
   - Created [`backend/package.json`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/package.json) with `express` and `dotenv`.
   - Created [`backend/.env.example`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/.env.example) and [`backend/src/config/index.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/config/index.js) so ports, directories, max upload size, and model names live in one place with safe defaults.
   - Created [`backend/src/index.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/index.js) bound strictly to `127.0.0.1` (`localhost`), [`backend/src/routes/healthRoutes.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/routes/healthRoutes.js), [`backend/src/controllers/healthController.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/controllers/healthController.js) (which also verifies `node:sqlite` readiness), and [`backend/src/middleware/errorHandler.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/middleware/errorHandler.js) (which prevents raw stack traces).
3. **Frontend Scaffolding (`frontend/`):**
   - Created [`frontend/package.json`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/frontend/package.json), [`frontend/vite.config.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/frontend/vite.config.js) (bound to `127.0.0.1:5173` with `/api` proxy to `http://127.0.0.1:3001`), [`frontend/src/api/health.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/frontend/src/api/health.js), and [`frontend/src/App.jsx`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/frontend/src/App.jsx) using React, Tailwind CSS, and Lucide React icons.
   - The page calls `GET /api/health` and displays **`backend OK`** along with live diagnostic cards for the local binding, `node:sqlite` engine version, and configured models (`Kim_Vocal_2.onnx` & `UVR-MDX-NET-Inst_HQ_3.onnx`).
4. **Python Separator Check Script (`separator/`):**
   - Created [`separator/requirements.txt`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/separator/requirements.txt), [`separator/README.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/separator/README.md), and [`separator/separate.py`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/separator/separate.py).
   - Running `.\separator\.venv\Scripts\python.exe separator/separate.py --check` verifies that `audio-separator`, `onnxruntime`, and `ffmpeg` are installed and outputs a single machine-readable JSON report on `stdout` with exit code `0`.

---

## 2. Files Created or Updated in Phase 1

- **Root:** [`.gitignore`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/.gitignore), [`README.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/README.md)
- **Backend:** [`backend/package.json`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/package.json), [`backend/.env.example`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/.env.example), [`backend/src/config/index.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/config/index.js), [`backend/src/index.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/index.js), [`backend/src/routes/healthRoutes.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/routes/healthRoutes.js), [`backend/src/controllers/healthController.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/controllers/healthController.js), [`backend/src/middleware/errorHandler.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/middleware/errorHandler.js)
- **Frontend:** [`frontend/package.json`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/frontend/package.json), [`frontend/vite.config.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/frontend/vite.config.js), [`frontend/index.html`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/frontend/index.html), [`frontend/src/main.jsx`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/frontend/src/main.jsx), [`frontend/src/App.jsx`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/frontend/src/App.jsx), [`frontend/src/api/health.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/frontend/src/api/health.js), [`frontend/src/styles/index.css`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/frontend/src/styles/index.css)
- **Separator:** [`separator/requirements.txt`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/separator/requirements.txt), [`separator/separate.py`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/separator/separate.py), [`separator/README.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/separator/README.md)
- **Documentation:** [`docs/architecture.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/architecture.md), [`docs/api.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/api.md), [`docs/separator-contract.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/separator-contract.md), [`docs/security-and-privacy.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/security-and-privacy.md), [`docs/troubleshooting.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/troubleshooting.md), [`docs/licenses.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/licenses.md), [`docs/phases/phase-1.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/phases/phase-1.md)

---

## 3. How to Verify Phase 1

1. **Start Backend (Terminal 1):**
   ```powershell
   npm --prefix backend run dev
   ```
   *Expected:* Prints `[Dunda na Fes] Backend listening strictly on http://127.0.0.1:3001`.
2. **Start Frontend (Terminal 2):**
   ```powershell
   npm --prefix frontend run dev
   ```
   *Expected:* Prints `Local: http://127.0.0.1:5173/`. Opening that URL in the browser shows the **Dunda na Fes** status card with a green **`backend OK`** badge.
3. **Run Python Check:**
   ```powershell
   .\separator\.venv\Scripts\python.exe separator/separate.py --check
   ```
   *Expected:* Prints a single JSON line with `"ok": true`, `"audioSeparator": {"ok": true, ...}`, and `"ffmpeg": {"ok": true, ...}`, exiting with code `0`.

---

## 4. Known Limitations in Phase 1

- `separator/separate.py` only performs the `--check` readiness verification in Phase 1; actual audio separation is built and benchmarked in Phase 2.
- SQLite tables (`library_entries`, `jobs`, `staged_files`) and CRUD routes are built in Phase 3.
