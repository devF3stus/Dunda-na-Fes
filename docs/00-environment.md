# 00 — Environment Report ("Dunda na Fes")

**Date Inspected:** 2026-10-21  
**Workspace Root:** `c:\Users\Administrator\Desktop\code projects\my_projects\Dunda`

---

## 1. Hardware Profile (Measured on Machine)

| Component | Measured Value | Implications for Audio Separation |
| :--- | :--- | :--- |
| **CPU** | AMD Ryzen 5 PRO 4650U with Radeon Graphics (6 physical cores, 12 logical threads) | Solid multi-core laptop processor. Because there is no NVIDIA GPU, all AI inference will run on CPU via ONNX Runtime. |
| **RAM** | 15.33 GB usable (16 GB physical) | Sufficient for MDX-Net / ONNX models (which typically use 1.5–3.5 GB of RAM during inference), provided we process **one job at a time** as required by the project rules. |
| **GPU** | Integrated AMD Radeon(TM) Graphics (512 MB dedicated VRAM, shared system memory; Driver `31.0.21018.23005`) | **No dedicated NVIDIA (CUDA) GPU.** Standard PyTorch/Demucs GPU acceleration is unavailable. CPU-first ONNX Runtime execution is mandatory. |
| **Operating System** | Microsoft Windows 11 Pro (`10.0.26200`, 64-bit) | Path handling must sanitize Windows-reserved characters (`< > : " / \ | ? *`) and handle Windows file-locking semantics carefully. |

---

## 2. Software & Tooling Status (Measured on Machine)

| Tool | Status | Measured Version / Path | Action / Requirement |
| :--- | :--- | :--- | :--- |
| **Node.js** | Installed | `v24.14.1` *(Installed via `OpenJS.NodeJS.22` winget package; `OpenJS.NodeJS.LTS` `24.20.0` is available in winget)* | **Note on `node:sqlite` requirement (`>= 24.16.0`):** Currently `24.14.1` is below `24.16.0` by two patch versions. We can either upgrade Node to `24.20.0 LTS` (`winget install --id OpenJS.NodeJS.LTS`), use `node:sqlite` on `24.14.1` (verified working), or use `better-sqlite3`. |
| **npm** | Installed | `11.11.0` | Ready. |
| **Python (Launcher `py`)** | Installed (2 versions) |<ul><li>Python `3.14.4` (`C:\Python314\python.exe`) — *Default*</li><li>Python `3.13` (`C:\Users\Administrator\AppData\Local\Programs\Python\Python313\python.exe`)</li></ul> | **Use Python 3.13** (`py -3.13 -m venv ...`) for `separator/.venv` to use prebuilt binary wheels. **Fallback:** If Python 3.13 encounters any install issues, install/use **Python 3.12** (`winget install Python.Python.3.12` / `py -3.12`). |
| **Git** | Installed | `2.52.0.windows.1` | Ready. |
| **WinGet** | Installed | `v1.29.380` | Ready. |
| **FFmpeg** | Installing via WinGet | `Gyan.FFmpeg` (`9.0.2`) | Installed via `winget install --id Gyan.FFmpeg -e --source winget`. |

---

## 3. How FFmpeg Is Installed & Configured

### Why FFmpeg is needed
Audio files exist in many container and compression formats (`.mp3`, `.m4a`, `.ogg`, `.flac`, `.wav`). AI separation models operate on raw uncompressed audio waveforms (PCM). **FFmpeg** is the industry-standard command-line engine used by both our backend (to inspect duration/format) and `audio-separator` (to decode compressed formats like MP3/M4A and encode final stems).

### Installation Command (Windows 11 via WinGet)

```powershell
winget install --id Gyan.FFmpeg -e --source winget
```

Our backend `.env` will also support an optional `FFMPEG_PATH` override so nothing is hard-coded.

---

## 4. Python Virtual Environment Strategy (`separator/.venv`)

In Phase 1, we will create an isolated Python virtual environment inside `separator/.venv` using Python 3.13 (or fallback to Python 3.12 if 3.13 encounters any install problems):

```powershell
py -3.13 -m venv separator/.venv
separator\.venv\Scripts\python.exe -m pip install --upgrade pip
separator\.venv\Scripts\python.exe -m pip install "audio-separator[cpu]"
```
