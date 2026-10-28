# Backend-to-Python Separator Contract

**Last Updated:** 2026-10-28 (Phase 8 — Hardened & Finalized)

This document defines the strict command-line contract between the Node.js Express backend (`backend/`) and the isolated Python audio separator (`separator/separate.py`).

---

## 1. Guiding Principles

- **One-shot execution:** The backend spawns a fresh Python process (`separator\.venv\Scripts\python.exe separator/separate.py ...`) for each job.
- **No shared state:** Python never reads or writes the SQLite database and never reads `.env` files directly. All parameters are passed explicitly via command-line arguments.
- **Machine-readable `stdout`:** Every status event emitted by `separate.py` on `stdout` is a single-line JSON object (`JSONL`). All internal library logs and `tqdm` progress bars are routed to `stderr` so `stdout` stays 100% parseable.
- **Automatic FFmpeg Discovery on Windows:** `separate.py` checks `--ffmpeg-path`, the system `PATH`, and the Windows WinGet installation folder (`%LOCALAPPDATA%\Microsoft\WinGet\...`) and prepends the directory to `os.environ["PATH"]` so `pydub` and `audio-separator` always find both `ffmpeg.exe` and `ffprobe.exe`.
- **Pre-Decode & Silence Guard:** Before loading the 64 MB ONNX model into RAM, `separate.py` normalizes the input audio via `ffmpeg -nostdin -v error -y -i <input> -vn -acodec pcm_s16le -ar 44100 -ac 2` into a temporary 44.1 kHz 2-channel stereo WAV file (`_decoded_input_44k.wav`). This automatically upmixes mono files to stereo, catches corrupt/truncated audio streams early (`CORRUPT_AUDIO_FILE`), and scans the waveform in 64 KB chunks to reject 100% silent recordings (`SILENT_AUDIO_FILE`) before running STFT normalization.
- **Long-Track Chunking:** `Separator(..., chunk_duration=300)` splits tracks longer than 5 minutes into 5-minute segments so 20+ minute medleys never exhaust system RAM.

---

## 2. Readiness Check Command (`--check`)

### Invocation
```powershell
.\separator\.venv\Scripts\python.exe separator/separate.py --check [--ffmpeg-path ffmpeg]
```

### Output on `stdout` (Single JSON line, Exit Code `0`)
```json
{
  "type": "check_result",
  "ok": true,
  "python": {
    "version": "3.13.7",
    "executable": "C:\\...\\separator\\.venv\\Scripts\\python.exe"
  },
  "audioSeparator": {
    "ok": true,
    "version": "0.47.1",
    "onnxruntimeVersion": "1.31.0",
    "providers": ["AzureExecutionProvider", "CPUExecutionProvider"]
  },
  "ffmpeg": {
    "ok": true,
    "path": "C:\\...\\ffmpeg.exe",
    "version": "ffmpeg version 9.0.2-full_build-www.gyan.dev Copyright (c) 2000-2026 the FFmpeg developers"
  }
}
```

---

## 3. Audio Separation Command

### Invocation
```powershell
.\separator\.venv\Scripts\python.exe separator/separate.py `
  --input <path-to-input-audio> `
  --output-dir <path-to-output-dir> `
  [--model-dir storage/models] `
  [--model UVR-MDX-NET-Inst_HQ_3.onnx] `
  [--fallback-model Kim_Vocal_2.onnx] `
  [--output-format wav|mp3|flac] `
  [--ffmpeg-path ffmpeg]
```

### Arguments

| Argument | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `--input` | Yes (unless `--check`) | — | Path to the input audio file (`.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`). |
| `--output-dir` | Yes (unless `--check`) | — | Directory where `vocals.<ext>` and `instrumental.<ext>` will be written. |
| `--model-dir` | No | `../storage/models` | Directory where downloaded `.onnx` model weights are cached. |
| `--model` | No | `UVR-MDX-NET-Inst_HQ_3.onnx` | Primary ONNX model filename to use. |
| `--fallback-model` | No | `Kim_Vocal_2.onnx` | Fallback ONNX model filename if `--model` fails to load. |
| `--output-format` | No | `wav` | Output audio format: `wav`, `mp3`, or `flac`. |
| `--ffmpeg-path` | No | `ffmpeg` | Optional explicit path to `ffmpeg` executable or directory. |

---

## 4. Structured JSON Events on `stdout`

1. **Progress Event (`type: "progress"`):**
   Emitted as the separator moves through `starting` (5% -> 8%), `loading_model` (12%), `separating` (25% -> 84%, reporting exact chunk ratios `1/N` to `N/N`), and `exporting` (90% -> 92%).
   ```json
   {"type": "progress", "stage": "separating", "percent": 49, "message": "Separating audio chunks (10/37)..."}
   ```
2. **Completion Event (`type: "complete"`, Exit Code `0`):**
   Emitted once both `vocals.<ext>` and `instrumental.<ext>` are verified on disk and non-empty. Includes measured wall-clock seconds and Win32 OS peak physical RAM (`PeakWorkingSetSize`) in MB.
   ```json
   {
     "type": "complete",
     "percent": 100,
     "vocalsPath": "C:\\...\\vocals.wav",
     "instrumentalPath": "C:\\...\\instrumental.wav",
     "outputFormat": "wav",
     "modelUsed": "UVR-MDX-NET-Inst_HQ_3.onnx",
     "elapsedSeconds": 43.67,
     "peakMemoryMb": 2985.36
   }
   ```
3. **Error Event (`type: "error"`, Non-zero Exit Code):**
   ```json
   {
     "type": "error",
     "code": "SILENT_AUDIO_FILE",
     "message": "The audio file contains only silence — no audible vocals or instruments were detected to separate."
   }
   ```

---

## 5. Exit Codes & Error Codes

| Exit Code | Constant | Error `code` Value(s) | Meaning |
| :--- | :--- | :--- | :--- |
| `0` | `EXIT_OK` | — | Success (`--check` passed or separation completed) |
| `1` | `EXIT_INVALID_ARGS` | `INVALID_ARGS` | Missing `--input`/`--output-dir` or unsupported `--output-format` |
| `2` | `EXIT_MISSING_DEPENDENCY` | `MISSING_DEPENDENCY` | `audio-separator` or `onnxruntime` import failed |
| `3` | `EXIT_FFMPEG_MISSING` | `FFMPEG_MISSING` | `ffmpeg` executable could not be found |
| `4` | `EXIT_INPUT_NOT_FOUND` | `INPUT_NOT_FOUND`, `INPUT_EMPTY` | Input audio file does not exist or is 0 bytes |
| `5` | `EXIT_MODEL_ERROR` | `MODEL_ERROR` | Model file missing and could not be downloaded/loaded |
| `6` | `EXIT_SEPARATION_FAILED` | `CORRUPT_AUDIO_FILE`, `SILENT_AUDIO_FILE`, `DISK_FULL`, `OUT_OF_MEMORY`, `SEPARATION_FAILED`, `OUTPUT_MISSING`, `OUTPUT_EMPTY`, `FILESYSTEM_ERROR` | Separation failed during pre-decode, silence check, disk check, inference, or output file writing |
