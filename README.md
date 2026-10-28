# Dunda na Fes

**Dunda na Fes** is a 100% local-only, single-user AI vocal & instrumental separator web application built for Windows 11. It lets you **Discover** openly licensed music (from the Internet Archive and Wikimedia Commons), upload or stage audio tracks in **Staging**, separate songs into studio-clean **Vocals** and **Instrumental** stems on your CPU in **Process** using Ultimate Vocal Remover ONNX models (`UVR-MDX-NET-Inst_HQ_3.onnx` and `Kim_Vocal_2.onnx`), and play, rename, or download your separated stems in **Library**.

> **Privacy & Security Guarantee:** Both the backend (`127.0.0.1:3001`) and frontend (`127.0.0.1:5173`) bind strictly to `127.0.0.1` (localhost). Your audio files never leave your computer during separation.

---

## 1. Prerequisites (Windows 11)

- **Node.js:** `v24.x` (built-in `node:sqlite` support)
- **Python:** `Python 3.13` (or `3.12`) via Windows Python Launcher (`py -3.13 --version`)
- **FFmpeg:** `ffmpeg` and `ffprobe` (`winget install Gyan.FFmpeg`)

---

## 2. Clean-Checkout Setup (Step-by-Step)

Open PowerShell in the repository root (`Dunda/`):

### Step 1 — Install Backend & Frontend Node Packages
```powershell
npm --prefix backend install
npm --prefix frontend install
```

### Step 2 — Create the Isolated Python Virtual Environment (`separator/.venv`)
```powershell
py -3.13 -m venv separator/.venv
.\separator\.venv\Scripts\python.exe -m pip install --upgrade pip
.\separator\.venv\Scripts\python.exe -m pip install -r separator/requirements.txt
```

### Step 3 — Verify the Python Separator & FFmpeg Readiness
```powershell
.\separator\.venv\Scripts\python.exe separator/separate.py --check
```
*Expected output: a single line of JSON with `"ok": true` confirming Python, `audio-separator`, `onnxruntime`, and `ffmpeg`.*

---

## 3. Running Dunda na Fes

### Terminal 1 — Start the Express Backend (`http://127.0.0.1:3001`)
```powershell
npm --prefix backend run dev
```

### Terminal 2 — Start the React + Vite Frontend (`http://127.0.0.1:5173`)
```powershell
npm --prefix frontend run dev
```

Then open **`http://127.0.0.1:5173`** in your browser.

---

## 4. Running Automated Tests & Production Build

From the repository root (`Dunda/`):

```powershell
# Run all 24 backend & separator integration tests
npm --prefix backend test

# Verify clean production frontend bundle
npm --prefix frontend run build
```

---

## 5. Project Structure

```text
Dunda/
├── README.md                  # Clean-checkout setup guide, overview, and docs index
├── .gitignore                 # Ignores models, audio, DB, node_modules, .venv, .env
├── frontend/                  # React 18 + Vite 6 + Tailwind CSS v4 + Lucide React ONLY
│   ├── src/
│   │   ├── api/client.js      # Central fetch wrapper for /api/*
│   │   ├── components/        # Layout.jsx, LibraryItemCard.jsx, ConfirmModal.jsx
│   │   ├── pages/             # DiscoverPage.jsx, StagingPage.jsx, ProcessPage.jsx, LibraryPage.jsx
│   │   └── utils/naming.js    # Live client-side Windows filename preview helper
│   └── package.json
├── backend/                   # Node.js + Express 4 + node:sqlite ONLY
│   ├── src/
│   │   ├── config/            # Environment & path configuration
│   │   ├── controllers/       # Route handlers (library, staging, jobs, discover)
│   │   ├── db/                # SQLite schema & startup crash/temp recovery
│   │   ├── jobs/jobQueue.js   # 1-at-a-time FIFO job queue & child process manager
│   │   ├── middleware/        # Multer upload middleware & central errorHandler
│   │   ├── routes/            # Express routers (/api/health, /library, /staging, /jobs, /discover)
│   │   ├── services/          # Business logic & SSRF-safe Discover downloader
│   │   └── utils/             # Magic-byte audio validation, ffprobe, filename sanitization
│   ├── test/                  # Automated test suites (health, library, jobs, discover, hardening)
│   ├── .env.example
│   └── package.json
├── separator/                 # Isolated Python CLI ONLY
│   ├── separate.py            # Single Python entry point invoked as a child process per job
│   ├── requirements.txt       # Pinned audio-separator[cpu]==0.47.1 & audioread>=3.0.1
│   └── README.md
├── storage/                   # Runtime local data (git-ignored except .gitkeep)
│   ├── staging/               # Uploaded/discovered songs waiting for separation
│   ├── library/               # Finished vocals.wav and instrumental.wav stems
│   ├── temp/                  # Per-job scratch directories (auto-cleaned)
│   ├── models/                # Cached ONNX models (UVR-MDX-NET-Inst_HQ_3.onnx, Kim_Vocal_2.onnx)
│   └── db/                    # SQLite database file (dunda.sqlite)
└── docs/                      # Living documentation, ADRs, and Phase 0–8 reports
```

---

## 6. Documentation Index (`docs/`)

- [`docs/00-environment.md`](docs/00-environment.md) — Hardware profile, software versions, FFmpeg & Python setup.
- [`docs/architecture.md`](docs/architecture.md) — System boundaries, data flow diagram, startup & failure recovery.
- [`docs/data-model.md`](docs/data-model.md) — SQLite tables (`staged_files`, `library_entries`, `jobs`) & crash recovery.
- [`docs/api.md`](docs/api.md) — REST API reference with example requests & responses.
- [`docs/separator-contract.md`](docs/separator-contract.md) — Command-line contract between Node.js and `separator/separate.py`.
- [`docs/security-and-privacy.md`](docs/security-and-privacy.md) — Localhost binding assumptions, SSRF allowlist, upload safety, and threat model.
- [`docs/licenses.md`](docs/licenses.md) — Licenses for all dependencies, tools, UVR ONNX models, and Discover sources.
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — Solutions to common setup and runtime issues.
- **Decisions (`docs/decisions/`):**
  - [`0001-separation-engine-and-models.md`](docs/decisions/0001-separation-engine-and-models.md)
  - [`0002-sqlite-driver.md`](docs/decisions/0002-sqlite-driver.md)
  - [`0003-discover-music-sources.md`](docs/decisions/0003-discover-music-sources.md)
- **Phase Reports (`docs/phases/`):**
  - [`phase-0.md`](docs/phases/phase-0.md) — Environment & Decisions
  - [`phase-1.md`](docs/phases/phase-1.md) — Scaffolding & Wiring
  - [`phase-2.md`](docs/phases/phase-2.md) — Python Separator Standalone
  - [`phase-3.md`](docs/phases/phase-3.md) — Database & Library CRUD API
  - [`phase-4.md`](docs/phases/phase-4.md) — Upload, Staging, & Job Queue API
  - [`phase-5.md`](docs/phases/phase-5.md) — Frontend Foundation & Library UI
  - [`phase-6.md`](docs/phases/phase-6.md) — Staging & Process Flow in the UI
  - [`phase-7.md`](docs/phases/phase-7.md) — Discover (Legal Openly-Licensed Music Sources)
  - [`phase-8.md`](docs/phases/phase-8.md) — Hardening, Polish, and Final Documentation Audit
