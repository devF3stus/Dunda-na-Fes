# Phase 0: Environment Inspection, Decisions & Risk List

**Status:** Complete (Updated per user review)  
**Date:** 2026-10-21

---

## 1. What Was Done in Phase 0 (No Application Code Written)

1. **Inspected your Windows 11 machine hardware & installed tools** via PowerShell CIM/WMI queries and CLI checks:
   - **CPU:** AMD Ryzen 5 PRO 4650U with Radeon Graphics (6 physical cores, 12 logical threads)
   - **RAM:** 15.33 GB usable (16 GB physical)
   - **GPU:** Integrated AMD Radeon Graphics (512 MB VRAM; no NVIDIA CUDA GPU)
   - **OS:** Windows 11 Pro 64-bit (`10.0.26200`)
   - **Node.js / npm:** `v24.14.1` / `11.11.0`
   - **Python:** Both Python `3.14.4` and Python `3.13` are installed via the Windows `py` launcher (`py -0p`).
   - **FFmpeg:** Launched installation of `Gyan.FFmpeg` (`9.0.2`) via `winget`.
2. **Updated Separation Model Selection & Verified Licenses** ([`docs/decisions/0001-separation-engine-and-models.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/decisions/0001-separation-engine-and-models.md) and [`docs/licenses.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/licenses.md)):
   - **Default Model:** **`Kim_Vocal_2.onnx`** (~66.8 MB, **MIT License** via Ultimate Vocal Remover).
   - **Fallback Model:** Replaced `UVR_MDXNET_KARA_2.onnx` with **`UVR-MDX-NET-Inst_HQ_3.onnx`** (~64.0 MB, **MIT License** via Ultimate Vocal Remover), which is an instrumental-focused model that strips all vocals (lead and backing).
3. **Python 3.13 with 3.12 Fallback:** Documented in [`docs/00-environment.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/00-environment.md) that `separator/.venv` will use Python `3.13` first, and immediately switch to Python `3.12` if any dependency fails to install cleanly.
4. **Checked Node Version Against `24.16.0` Threshold** ([`docs/decisions/0002-sqlite-driver.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/decisions/0002-sqlite-driver.md)):
   - Your installed Node version is **`v24.14.1`** (which is below `24.16.0`). See confirmation question before Phase 1.

---

## 2. Risk Register & Mitigations

| # | Risk | Severity | Likelihood | Mitigation Strategy |
| :- | :--- | :--- | :--- | :--- |
| **R1** | **FFmpeg missing from `PATH` until installed / shell refreshed** | High | Resolved / In Progress | Installing `Gyan.FFmpeg` via `winget`. Backend `.env` will also allow an explicit `FFMPEG_PATH` override. |
| **R2** | **Python 3.14 missing prebuilt binary wheels; potential 3.13 edge cases** | High | Mitigated | Use **Python 3.13** (`py -3.13 -m venv separator/.venv`) and fall back to **Python 3.12** if any install issue occurs. |
| **R3** | **CPU-only processing time & RAM pressure on 15.33 GB RAM** | Medium | High | Use 2-stem ONNX MDX-Net models (`Kim_Vocal_2.onnx` default, `UVR-MDX-NET-Inst_HQ_3.onnx` fallback) via `onnxruntime` CPU provider (~2–3.5 GB RAM). Enforce a strict **1-job-at-a-time queue**. |
| **R4** | **First-run model download (~64–67 MB) requires internet access** | Medium | Medium | Configure `audio-separator` to store downloaded models in `storage/models/`. Surface download/initialization status clearly, and catch network errors with a human-readable UI error if offline. |
| **R5** | **Windows file locking when deleting or renaming audio files** | Medium | Medium | Ensure audio streams and child processes are closed before `fs.unlink`/`fs.rename`. Clean up leftover temporary files on server startup. |
| **R6** | **Orphaned Python child process if user cancels a job or stops server** | Medium | Medium | Track the child process PID in the job runner; on cancellation, terminate the process tree cleanly on Windows (`taskkill /PID <pid> /T /F` or `child.kill()`) and delete partial temp outputs. |

---

## 3. Folder Structure (Approved)

`frontend/`, `backend/`, `separator/`, `storage/`, and `docs/` will be placed directly at the root of `c:\Users\Administrator\Desktop\code projects\my_projects\Dunda`.
