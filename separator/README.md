# Separator Component (`separator/`)

This directory contains the **only Python code** in **Dunda na Fes**.
It is completely isolated from the browser and the SQLite database. The Node.js backend invokes `separate.py` as a one-shot child process per job.

Full specification: see [`docs/separator-contract.md`](../docs/separator-contract.md).

---

## 1. Setup (Windows 11)

From the repository root (`Dunda/`):

```powershell
# 1. Create an isolated Python 3.13 virtual environment
py -3.13 -m venv separator/.venv

# 2. Upgrade pip and install dependencies
.\separator\.venv\Scripts\python.exe -m pip install --upgrade pip
.\separator\.venv\Scripts\python.exe -m pip install -r separator/requirements.txt
```

---

## 2. Usage Examples

### A. Readiness Check (`--check`)
```powershell
.\separator\.venv\Scripts\python.exe separator/separate.py --check
```

### B. Separate an Audio File into Vocals & Instrumental
```powershell
.\separator\.venv\Scripts\python.exe separator/separate.py `
  --input "storage/temp/sample_clip_15s.mp3" `
  --output-dir "storage/temp/test_clip_out" `
  --model-dir "storage/models" `
  --model "UVR-MDX-NET-Inst_HQ_3.onnx"
```

*Note: To hide `audio-separator`'s internal `stderr` logs in PowerShell when running manually and see only the clean JSON lines on `stdout`, append `2>$null`.*

---

## 3. Measured Performance on Your Machine (AMD Ryzen 5 PRO 4650U, 16 GB RAM, CPU-Only)

Measured on **2026-10-22** using both cached models in `storage/models/`:

| Model & Test Case | Input Duration | Chunks | Total Elapsed Time | Peak Physical RAM (`PeakWorkingSetSize`) | Vocal Bleed Projection (`300–3400 Hz`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`UVR-MDX-NET-Inst_HQ_3.onnx` (Default) — Short Clip** | `00:15` (15.0s) | 4 chunks | **44.35 s** | **2,968.26 MB** (~2.90 GB) | **`0.0715`** (Clean instrumental) |
| **`UVR-MDX-NET-Inst_HQ_3.onnx` (Default) — Full Song** | `02:40` (160.5s) | 37 chunks | **227.86 s** (3 min 47.9 s; RTF ~1.42x) | **3,333.97 MB** (~3.26 GB) | **`0.0715`** (Clean instrumental) |
| **`Kim_Vocal_2.onnx` (Fallback) — Short Clip** | `00:15` (15.0s) | 4 chunks | **43.67 s** | **2,985.36 MB** (~2.92 GB) | `0.4151` (Faint vocal bleed in inst) |
| **`Kim_Vocal_2.onnx` (Fallback) — Full Song** | `02:40` (160.5s) | 37 chunks | **244.76 s** (4 min 04.8 s; RTF ~1.52x) | **3,353.02 MB** (~3.27 GB) | `0.4151` (Faint vocal bleed in inst) |
