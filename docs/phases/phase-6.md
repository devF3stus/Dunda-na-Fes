# Phase 6 Summary: Staging and Process Flow in the UI

**Date:** 2026-10-22  
**Status:** Completed (Awaiting User Approval)

---

## 1. What Was Built & Why

In Phase 6, we unlocked the **Staging** and **Process** tabs in the React frontend and connected them end-to-end with the backend upload, magic-byte validation, and 1-at-a-time AI separation job queue built in Phase 4:

1. **Staging API & Job Queue Client Functions (`frontend/src/api/client.js`)**:
   - Added `fetchStagedFiles()`, `uploadAudioToStaging(file, licenseInfo)`, `deleteStagedFile(id)`, and `getStagedAudioPreviewUrl(id)`.
   - Added `fetchJobs()`, `fetchJob(id)`, `createSeparationJob({ stagedFileId, customName, modelName })`, and `cancelSeparationJob(id)`.
   - **Teaching Note (`FormData` and Browser `Content-Type` Boundaries)**: When uploading files with `fetch()` using `FormData`, we deliberately do **not** manually set `Content-Type: multipart/form-data`. Instead, the browser sets the header automatically so it can append the required cryptographic boundary string (`multipart/form-data; boundary=----WebKitFormBoundary...`) that `multer` on the backend needs to parse the binary stream.

2. **Staging Area Page (`frontend/src/pages/StagingPage.jsx`)**:
   - **Drag-and-Drop + File Picker Upload Zone**: Accepts `.mp3, .wav, .flac, .m4a, .ogg` files, shows live validation feedback while the server checks binary magic bytes and `ffprobe` duration, and displays clear human-readable error banners if a non-audio or corrupted file is rejected.
   - **Staged Song Cards**: Shows original filename, automatically cleaned suggested name, duration (`m:ss`), file size (`KB`/`MB`), source/license badge, inline `<audio>` preview player, a **"Remove"** button (with `ConfirmModal`), and a primary **"Separate"** button that navigates to the **Process** tab with that track pre-selected.

3. **Process & Separation Queue Page (`frontend/src/pages/ProcessPage.jsx`)**:
   - **Song Selection**: Automatically highlights the song selected from Staging (or lets you pick any currently staged song).
   - **Naming Choice (Suggested vs Custom)**: Lets you either accept the automatically suggested clean name (`suggestedName`) or type a custom name with a live preview of Windows filename sanitization and duplicate handling (`(2)`, `(3)`).
   - **AI Model Selection**: Defaults to `UVR-MDX-NET-Inst_HQ_3.onnx` (verified in Phase 2 to eliminate background vocal bleed) with `Kim_Vocal_2.onnx` available as a fallback.
   - **Live Progress Polling & Cancellation**: Polls `/api/jobs` and `/api/staging` every 1.5 seconds whenever at least one job is `queued` or `running`. Displays a live elapsed timer, current stage badge (`Starting Python Engine`, `Loading ONNX AI Model`, `Separating Audio Chunks`, `Saving Vocals & Instrumental Stems`), real-time ONNX chunk progress bar (`0%–100%`), and a **"Cancel Job"** button.
   - **Completion & Error Feedback**: Completed jobs show a green card with a **"Listen in Library"** button that jumps directly to your Library; cancelled or failed jobs show a clear human-readable explanation.

4. **Navigation Badges & State Wiring (`frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`)**:
   - The top navigation bar now displays live count badges on **Staging**, **Process** (with a spinning indicator while a job is actively running), and **Library**.

---

## 2. Verification Checklist

1. **Automated Build & Backend Tests**:
   ```powershell
   npm --prefix frontend run build
   npm --prefix backend test
   ```
2. **End-to-End Browser Verification**:
   - Start the backend (`npm --prefix backend start`) and frontend (`npm --prefix frontend run dev`), and open `http://127.0.0.1:5173`.
   - Go to **Staging** and upload `storage/temp/sample_clip_15s.mp3` (or any song from your computer).
   - Verify the song card appears with duration (`0:15`), size, and a working audio preview player.
   - Click **"Separate"** on the staged song to jump to **Process**.
   - Choose either **Use Suggested Name** or **Type a Custom Name**, click **"Start Separation"**, and watch the real-time ONNX chunk progress bar reach `100%`.
   - Click **"Listen in Library"** when finished and verify both the **Vocals** and **Instrumental** stems play and download cleanly, and that the staged original was automatically cleaned up from **Staging**.
