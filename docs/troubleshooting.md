# Troubleshooting Guide ("Dunda na Fes")

**Last Updated:** 2026-10-28 (Phase 8 — Final Audit)

---

## 1. `'ffmpeg' is not recognized as the name of a cmdlet...` or `EXIT_FFMPEG_MISSING` (Exit Code 3)

- **Cause:** FFmpeg was recently installed via `winget`, and your current PowerShell window still has the old `PATH` cached in memory.
- **Fix:**
  1. Close and reopen your PowerShell terminal, **or** run this command in your current PowerShell window to reload `PATH` without closing it:
     ```powershell
     $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
     ```
  2. Verify with `ffmpeg -version`.
  3. Note that both `backend/src/utils/audioValidation.js` and `separator/separate.py` automatically search `%LOCALAPPDATA%\Microsoft\WinGet\Packages\` on Windows even if your shell `PATH` has not been refreshed yet.

---

## 2. `ModuleNotFoundError: No module named 'audioread'` When Importing `audio-separator`

- **Cause:** `librosa 1.0.0` (a dependency of `audio-separator`) dropped `audioread` from its automatic install dependencies, while `audio-separator` still imports `audioread`.
- **Fix:** We explicitly pinned `audioread>=3.0.1` in [`separator/requirements.txt`](../separator/requirements.txt). Installing via `.\separator\.venv\Scripts\python.exe -m pip install -r separator/requirements.txt` resolves this automatically.

---

## 3. Frontend Shows `"Backend Offline"` or `"Backend Connection Issue"`

- **Cause:** The Express backend (`http://127.0.0.1:3001`) is not running, or another process is blocking port `3001`.
- **Fix:**
  1. Open a terminal in the repository root (`Dunda/`) and run:
     ```powershell
     npm --prefix backend run dev
     ```
  2. Confirm it prints: `[Dunda na Fes] Backend listening strictly on http://127.0.0.1:3001`.
  3. Click **Retry** in the browser UI.

---

## 4. Python Package Installation Fails on Windows

- **Cause:** Running `pip install` under Python 3.14 (which is your system default `python`) may attempt to compile C/C++ packages from source if prebuilt wheels aren't published yet.
- **Fix:** Always create `separator/.venv` using **Python 3.13** (or **Python 3.12**):
  ```powershell
  py -3.13 -m venv separator/.venv
  .\separator\.venv\Scripts\python.exe -m pip install -r separator/requirements.txt
  ```

---

## 5. `"Job was interrupted because the server was restarted before processing finished."` (`Processed in 0:00`)

- **Cause:** Running Node's built-in file watcher with plain `--watch` (`node --watch src/index.js`) watches directories touched by `fs.*` at startup (`storage/temp/` and `storage/db/`). When a separation job starts and creates `storage/temp/job-<id>`, plain `--watch` mistakes that folder creation for a code change and restarts the Express server 500ms later (`SIGTERM`), causing startup recovery to mark the job interrupted.
- **Fix:** `backend/package.json` uses `--watch-path=./src` (`node --no-warnings --watch-path=./src src/index.js`) so Node only watches `backend/src/` and never restarts when runtime files change inside `storage/`. In addition, `jobQueue.js` continuously drains `child.stderr`, and `separator/separate.py` sets `chunk_duration=300` so long tracks (>5 minutes, such as 20+ minute medleys) are processed in 5-minute parts without exhausting RAM.

---

## 6. Upload Rejected with `"CORRUPT_AUDIO_FILE"` or Separation Fails with `"SILENT_AUDIO_FILE"`

- **`CORRUPT_AUDIO_FILE`:** The file has an audio extension or header, but its audio stream is truncated, zero-length, or unreadable by `ffprobe`/`ffmpeg`. Re-export or re-download the audio file and try again.
- **`SILENT_AUDIO_FILE`:** The uploaded audio file contains 100% digital silence across all frames (no audible vocals or instruments). Verify that the recording was not muted before uploading.
- **`DISK_FULL`:** Your hard drive has less than the minimum free space required to write the separated WAV stems. Free up disk space (or delete old stems from the Library tab) and try again.
