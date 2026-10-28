# ADR 0001: Audio Separation Engine & Model Selection

- **Date:** 2026-10-22
- **Status:** Approved & Updated in Phase 2 (`UVR-MDX-NET-Inst_HQ_3.onnx` promoted to Default Model after empirical listening test)

---

## 1. Context

"Dunda na Fes" requires a local, isolated Python component (`separator/separate.py`) that separates a song into **vocals** and **instrumental** files.

Per the Phase 0 hardware inspection ([`docs/00-environment.md`](file:///c:/Users/Administrator/Desktop/code%20projects/my_projects/Dunda/docs/00-environment.md)):
- **CPU:** AMD Ryzen 5 PRO 4650U (6 cores, 12 threads)
- **RAM:** 15.33 GB usable
- **GPU:** Integrated AMD Radeon Graphics (512 MB VRAM; **no NVIDIA CUDA GPU**)
- **OS:** Windows 11 Pro 64-bit
- **Python:** Python `3.13.7` (`py -3.13`) in `separator/.venv`.

---

## 2. Empirical Model Comparison in Phase 2 (Why `UVR-MDX-NET-Inst_HQ_3.onnx` Is Default)

During Phase 2 testing on *Swanee* (1920 recording by Al Jolson), we compared **`Kim_Vocal_2.onnx`** and **`UVR-MDX-NET-Inst_HQ_3.onnx`**:

- **How MDX-Net 2-stem models work:** An MDX-Net model directly predicts **one primary stem** using its neural network and computes the **secondary stem** by subtracting the primary stem from the original waveform (`secondary = mix - primary * compensate`).
- When **`Kim_Vocal_2.onnx`** was used as primary, the neural network predicted `Vocals` directly and created `Instrumental` via waveform subtraction. Because slight phase/reverb differences remain in the mix, faint background vocals were audible in `instrumental.wav` (measured vocal-band `300–3400 Hz` bleed projection: **`0.4151`**).
- When **`UVR-MDX-NET-Inst_HQ_3.onnx`** was used as primary, the neural network predicted the clean `Instrumental` directly in the spectrogram domain—aggressively stripping all vocals and vocal reverb tails—and derived `Vocals` as the complement. Measured vocal-band bleed projection dropped from `0.4151` to **`0.0715`** (**an 83% reduction in vocal bleed**), while also running slightly faster (`227.86s` vs `244.76s` on the full song).

---

## 3. Final Decision & Model License Verification

1. **Selected Separation Engine:** **`audio-separator[cpu]`** (`nomadkaraoke/python-audio-separator`, **MIT License**).
2. **Selected Default Model:** **`UVR-MDX-NET-Inst_HQ_3.onnx`** (~64.0 MB)
   - **Focus:** Direct neural instrumental extraction (eliminates background vocal bleed in the instrumental stem while still outputting the full isolated vocal stem).
   - **License & Provenance (Verified 2026-10-21):** **MIT License** with attribution to Ultimate Vocal Remover (`Anjok07` and `aufr33`), verified via [`Anjok07/ultimatevocalremovergui/README.md`](https://raw.githubusercontent.com/Anjok07/ultimatevocalremovergui/master/README.md).
3. **Selected Fallback Model:** **`Kim_Vocal_2.onnx`** (~66.8 MB)
   - **Focus:** Vocal-primary MDX-Net model used automatically if the primary model fails to load.
   - **License & Provenance (Verified 2026-10-21):** **MIT License** with attribution to Ultimate Vocal Remover (`Anjok07`, `aufr33`, `KimberleyJSN`).
