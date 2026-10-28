# Phase 2: Separation Engine, Standalone

**Status:** Complete — Updated with `UVR-MDX-NET-Inst_HQ_3.onnx` Default to Eliminate Instrumental Vocal Bleed  
**Date:** 2026-10-22

---

## 1. What Was Built & Why

1. **Full Standalone CLI Implementation ([`separator/separate.py`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/separator/separate.py)):**
   - Accepts `--input`, `--output-dir`, `--model-dir`, `--model` (defaults to `UVR-MDX-NET-Inst_HQ_3.onnx`), `--fallback-model` (defaults to `Kim_Vocal_2.onnx`), `--output-format` (`wav`, `mp3`, `flac`), `--ffmpeg-path`, and `--check`.
   - **Clean `stdout` JSONL Contract:** Redirects `sys.stdout` to `sys.stderr` while importing and running `audio-separator` so third-party library banners and `tqdm` bars never corrupt `stdout`. Uses `sys.__stdout__` exclusively to emit single-line JSON events (`type: "progress"`, `type: "complete"`, `type: "error"`).
   - **Real Chunk Progress (Not Simulated):** `SeparationLogHandler` attaches to `audio-separator`'s logger and intercepts `"Processing chunk X/Y"` messages from `MDXSeparator.demix()`, mapping chunk completion smoothly from `38%` to `82%`.
   - **Eliminating Background Vocal Bleed in Instrumentals:**
     - During listening verification, `Kim_Vocal_2.onnx` produced clean vocals, but its subtracted `instrumental.wav` retained faint background vocals (because `Kim_Vocal_2` predicts `Vocals` with the neural network and creates `Instrumental` by simple waveform subtraction `mix - vocals`).
     - We tested **`UVR-MDX-NET-Inst_HQ_3.onnx`**, whose neural network directly predicts a clean `Instrumental` in the spectrogram domain (stripping vocal frequencies and reverb tails) and derives `Vocals` as the complement.
     - Acoustic cross-correlation in the vocal band (`300–3400 Hz`) confirmed that **`UVR-MDX-NET-Inst_HQ_3.onnx` reduced vocal bleed in `instrumental.wav` by 83%** (`0.0715` vs `0.4151`), and also ran 17 seconds faster on the full song (`227.86s` vs `244.76s`). We promoted `UVR-MDX-NET-Inst_HQ_3.onnx` to **Default Model** and moved `Kim_Vocal_2.onnx` to **Fallback Model**.

---

## 2. Empirical Hardware Benchmarks (Measured on Your Machine)

- **Machine:** AMD Ryzen 5 PRO 4650U (6C/12T), 15.33 GB usable RAM, Windows 11 Pro 64-bit, CPU-only (`CPUExecutionProvider`).
- **Test Audio:** *Swanee* (1920 recording by Al Jolson, Public Domain via Internet Archive `hits-of-1920-whispering`).
  - Short clip: `storage/temp/sample_clip_15s.mp3` (15.0 seconds, 240 KB)
  - Full song: `storage/temp/sample_full_swanee_1920.mp3` (2 min 40.5 seconds, 2.57 MB)

| Model & Run | Input File | Audio Length | STFT Chunks | Measured Elapsed Time | Measured Peak RAM (`peakMemoryMb`) | Vocal Bleed Projection (`300–3400 Hz`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`UVR-MDX-NET-Inst_HQ_3.onnx` (Default) — Short Clip** | `sample_clip_15s.mp3` | `00:15` | 4 | **44.35 s** | **2,968.26 MB** (~2.90 GB) | **`0.0715`** (Clean instrumental) |
| **`UVR-MDX-NET-Inst_HQ_3.onnx` (Default) — Full Song** | `sample_full_swanee_1920.mp3` | `02:40.5` | 37 | **227.86 s** (3 min 47.9 s; ~1.42x real-time) | **3,333.97 MB** (~3.26 GB) | **`0.0715`** (Clean instrumental) |
| **`Kim_Vocal_2.onnx` (Fallback) — Short Clip** | `sample_clip_15s.mp3` | `00:15` | 4 | **43.67 s** | **2,985.36 MB** (~2.92 GB) | `0.4151` (Faint vocal bleed) |
| **`Kim_Vocal_2.onnx` (Fallback) — Full Song** | `sample_full_swanee_1920.mp3` | `02:40.5` | 37 | **244.76 s** (4 min 04.8 s; ~1.52x real-time) | **3,353.02 MB** (~3.27 GB) | `0.4151` (Faint vocal bleed) |

---

## 3. Files Created or Updated in Phase 2

- [`separator/separate.py`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/separator/separate.py) — Full standalone CLI implementation (`DEFAULT_MODEL = "UVR-MDX-NET-Inst_HQ_3.onnx"`).
- [`backend/src/config/index.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/src/config/index.js), [`backend/.env.example`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/.env.example), [`backend/test/health.test.js`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/backend/test/health.test.js) — Updated default/fallback model configuration.
- [`separator/README.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/separator/README.md) — Updated with CLI usage examples and measured hardware benchmarks.
- [`docs/decisions/0001-separation-engine-and-models.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/decisions/0001-separation-engine-and-models.md) — Updated with Phase 2 acoustic findings.
- [`docs/separator-contract.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/separator-contract.md) — Updated with exact arguments, progress stages, completion payload, and error codes.
- [`docs/phases/phase-2.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/phases/phase-2.md) — This Phase 2 report and benchmark log.
