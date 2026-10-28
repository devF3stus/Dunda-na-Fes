# Licenses & Third-Party Attribution ("Dunda na Fes")

**Last Updated:** 2026-10-28 (Phase 8 — Final Audit)

This document tracks the license of every software dependency, external binary, AI separation model, and public audio source used in **Dunda na Fes**. It is updated in the same phase whenever a new dependency, model, or content source is introduced.

---

## 1. AI Audio Separation Models & Engine (`separator/`)

| Component / Model | Author / Maintainer | License | Verification Source & Date | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **`audio-separator`** (`v0.47.1`) | Nomad Karaoke / Andrew Beveridge (`@beveradb` / `karaokenerds`) | **MIT License** | [GitHub LICENSE](https://raw.githubusercontent.com/nomadkaraoke/python-audio-separator/main/LICENSE) (2026-10-21) | Python CLI/library wrapper used in `separator/`. |
| **`audioread`** (`v3.1.0`) | Adrian Sampson (`beetbox/audioread`) | **MIT License** | [PyPI / GitHub](https://github.com/beetbox/audioread) (2026-10-21) | Explicit companion dependency required by `audio-separator` when `librosa >= 1.0.0` is installed. |
| **`UVR-MDX-NET-Inst_HQ_3.onnx`** *(Default Model)* | Ultimate Vocal Remover (`Anjok07`, `aufr33`) on Kuielab MDX-Net | **MIT License** (Attribution required) | [UVR README — License & Credits](https://raw.githubusercontent.com/Anjok07/ultimatevocalremovergui/master/README.md) (2026-10-21) | ~64.0 MB ONNX model. Instrumental-focused model that directly predicts a clean instrumental (eliminating background vocal bleed) and derives vocals as the complement. |
| **`Kim_Vocal_2.onnx`** *(Fallback Model)* | Ultimate Vocal Remover (`Anjok07`, `aufr33`, `KimberleyJSN`) on Kuielab MDX-Net | **MIT License** (Attribution required) | [UVR README — License & Credits](https://raw.githubusercontent.com/Anjok07/ultimatevocalremovergui/master/README.md) (2026-10-21) | ~66.8 MB ONNX model. Fallback vocal extraction model. |
| **`onnxruntime`** (CPU Execution Provider) | Microsoft Corporation | **MIT License** | [PyPI / GitHub](https://github.com/microsoft/onnxruntime/blob/main/LICENSE) (2026-10-21) | Runs `.onnx` inference on CPU. |

### Required Attribution Notice (Ultimate Vocal Remover)
> Audio separation models (`UVR-MDX-NET-Inst_HQ_3.onnx` and `Kim_Vocal_2.onnx`) are provided courtesy of the **Ultimate Vocal Remover (UVR)** project by **Anjok07** and **aufr33** (with MDX-Net architecture by **Kuielab & Woosung Choi** and training advisement by **KimberleyJSN**), distributed under the MIT License.

---

## 2. Backend Dependencies (`backend/package.json`)

| Package | Version | License | Purpose |
| :--- | :--- | :--- | :--- |
| **`express`** | `^4.21.2` | **MIT License** | HTTP web server bound to `127.0.0.1`. |
| **`dotenv`** | `^16.4.7` | **BSD-2-Clause License** | Loads environment variables from `backend/.env`. |
| **`multer`** | `^2.0.0` | **MIT License** | Multipart file upload middleware for `POST /api/staging/upload`. |
| **`node:sqlite`** *(Built-in)* | Node `v24.14.1` | **MIT / Public Domain (SQLite)** | Built-in synchronous SQLite database engine (`DatabaseSync`). |

---

## 3. Frontend Dependencies (`frontend/package.json`)

| Package | Version | License | Purpose |
| :--- | :--- | :--- | :--- |
| **`react` & `react-dom`** | `^18.3.1` | **MIT License** | UI component library. |
| **`vite` & `@vitejs/plugin-react`** | `^6.0.5` / `^4.3.4` | **MIT License** | Frontend build tool and local dev server. |
| **`tailwindcss` & `@tailwindcss/vite`** | `^4.0.0` | **MIT License** | Utility-first CSS styling framework. |
| **`lucide-react`** | `^0.469.0` | **ISC License** | Clean icon set for the UI. |

---

## 4. System Runtimes & External Tools

| Tool | Installed Version | License | Source & Date |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v24.14.1` | **MIT License** | [nodejs.org](https://nodejs.org) (2026-10-21) |
| **Python** | `3.13.7` (Fallback: `3.12`) | **PSF License** (BSD-style permissive) | [docs.python.org/3/license.html](https://docs.python.org/3/license.html) (2026-10-21) |
| **FFmpeg** (`Gyan.FFmpeg`) | `9.0.2` (full_build via WinGet) | **GPL v3** (invoked strictly as an external command-line executable via child process; not linked into code) | [gyan.dev/ffmpeg/builds/](https://www.gyan.dev/ffmpeg/builds/) (2026-10-21) |

---

## 5. Approved Discover Openly-Licensed Music Sources (Phase 7)

| Content Source | API Endpoint | Supported Per-Track Licenses | Verification Date | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Internet Archive Audio** (`archive.org`) | `https://archive.org/advancedsearch.php` & `https://archive.org/metadata/<id>` | **Public Domain Mark 1.0**, **CC0 1.0**, **CC BY**, **CC BY-SA**, **CC BY-NC** (filtered strictly to items with an explicit `licenseurl`) | `2026-10-28` ([ADR 0003](decisions/0003-discover-music-sources.md)) | Per-track license label, source badge, and license URL are displayed in Discover and persisted in `license_info` across Staging and Library. |
| **Wikimedia Commons Audio** (`commons.wikimedia.org`) | `https://commons.wikimedia.org/w/api.php` | **Public Domain**, **CC0**, **CC BY 3.0/4.0**, **CC BY-SA 3.0/4.0** (from `extmetadata.LicenseShortName` & `LicenseUrl`) | `2026-10-28` ([ADR 0003](decisions/0003-discover-music-sources.md)) | Per-track license label, artist attribution, and license URL are displayed in Discover and persisted in `license_info` across Staging and Library. |
