# Phase 7 Summary: Discover (Legal Openly-Licensed Music Sources)

**Date:** 2026-10-28  
**Status:** Completed (Awaiting User Approval)

---

## 1. What Was Built & Why

In Phase 7, after live-testing candidate APIs and confirming your selection of **both** **Internet Archive (`archive.org`)** and **Wikimedia Commons (`commons.wikimedia.org`)**, we built the complete **Discover** feature end-to-end:

1. **Architecture Decision Record (`docs/decisions/0003-discover-music-sources.md`)**:
   - Documented our live API tests (`2026-10-28`), API endpoints, per-track license fields, and why **Internet Archive** and **Wikimedia Commons** were selected (zero API keys required, `<300ms` response times, explicit Creative Commons / Public Domain license metadata).

2. **Backend Discover Service, Controller, & Routes (`backend/src/services/discoverService.js`, `backend/src/controllers/discoverController.js`, `backend/src/routes/discoverRoutes.js`)**:
   - **`GET /api/discover/search?q=<term>&source=both|archive|wikimedia`**:
     - Queries Internet Archive's Advanced Search + Item Metadata APIs (`mediatype:audio AND licenseurl:(*creativecommons* OR *publicdomain*) AND NOT collection:librivoxaudio`) and/or Wikimedia Commons' MediaWiki Action API (`filetype:audio` in namespace `6`).
     - Extracts clean track title, artist/creator, duration, file size, format (`MP3`, `OGG`, `WAV`, `FLAC`), direct audio stream URL, source record URL, and normalized per-track license (`Public Domain`, `CC0 1.0`, `CC BY 4.0`, `CC BY-SA 4.0`, etc.).
     - Uses `Promise.allSettled` when `source=both` so if one catalogue is slow or temporarily unreachable, results from the other catalogue still appear along with a friendly warning banner.
   - **`POST /api/discover/stage` ("Add to Staging")**:
     - **Teaching Note (SSRF Protection via Domain Allowlisting):** Whenever a backend server downloads a URL provided by a client request, a malicious request could try to pass internal network addresses (like `http://127.0.0.1` or `http://169.254.169.254`) or unapproved websites — a vulnerability known as **Server-Side Request Forgery (SSRF)**. Our `validateAllowedDiscoverAudioUrl()` helper parses the URL with `new URL()`, requires `https:`, and strictly enforces an allowlist of `archive.org`, `*.archive.org`, `upload.wikimedia.org`, and `commons.wikimedia.org`.
     - Streams the audio file into `storage/temp/discover-<uuid>.<ext>`, enforces `MAX_UPLOAD_SIZE_MB`, and passes the downloaded file through `stageAudioFileFromTemp()` so its binary magic-byte header (`ID3`, `RIFF`, `OggS`, `fLaC`, `ftyp`) and `ffprobe` duration are verified before saving `source = 'discover'` and `license_info` in SQLite.

3. **Frontend Discover Page (`frontend/src/pages/DiscoverPage.jsx`, `frontend/src/App.jsx`, `frontend/src/api/client.js`)**:
   - Source filter pills (**Both Catalogues**, **Internet Archive**, **Wikimedia Commons**) and one-click quick search chips (`gospel vocal`, `jazz vocal`, `blues song`, `acoustic folk song`, `classical soprano`).
   - Displays every track's **Source badge**, clickable **License badge** (`License: Public Domain`, `License: CC BY 4.0`, etc.), format, duration, file size, and an inline `<audio>` preview player.
   - **"Add to Staging"** button downloads and validates the track into Staging, then transforms into **"Separate Now"** (which jumps straight to **Process** with that track selected) and **"In Staging"**.

4. **Automated Tests (`backend/test/discover.test.js`)**:
   - Added 3 new tests covering license URL normalization, SSRF domain allowlist enforcement, dual-catalogue search parsing, and downloading/validating a discovered track into Staging with its license preserved (all 19 backend tests pass).

---

## 2. Verification Checklist

1. **Automated Tests & Frontend Build**:
   ```powershell
   npm --prefix backend test
   npm --prefix frontend run build
   ```
2. **End-to-End Browser Verification**:
   - Open `http://127.0.0.1:5173` and click the **Discover** tab.
   - Click one of the quick-search chips (e.g., `gospel vocal` or `jazz vocal`) or type a search query and click **Search Catalogues**.
   - Verify results display their **Source badge** (`Internet Archive` / `Wikimedia Commons`) and green **License badge** (`License: Public Domain`, `License: CC BY ...`).
   - Click play on the **Preview Track** audio player to preview a track before downloading.
   - Click **"Add to Staging"** on a track and verify it downloads, validates, and shows **"Separate Now"** and **"In Staging"**, and that the license is preserved in Staging and Library.
