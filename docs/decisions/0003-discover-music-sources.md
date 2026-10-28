# ADR 0003: Legal, Openly-Licensed Music Sources for Discover (Phase 7)

**Date:** 2026-10-28  
**Status:** Accepted (Both Internet Archive & Wikimedia Commons Enabled)

---

## 1. Context & Non-Negotiable Rules

Per Section 6 of the Project Brief:
- Dunda na Fes must **never** rip, scrape, or download from commercial streaming or video platforms (YouTube, Spotify, SoundCloud, etc.) or bypass DRM/Terms of Service.
- The **Discover** area must only search catalogues that explicitly permit free legal download under **Public Domain** or **Creative Commons** licenses.
- Every track must display its license in the UI and store that license with the song when imported into Staging (`staged_files.license_info`) and separated into the Library (`library_entries.license_info`).
- API failures, rate limits, and zero-result queries must be handled gracefully with human-readable messages. If an API key is used, it must live in `backend/.env` (never in code).

---

## 2. Live API Research & Candidates Evaluated (2026-10-28)

We tested four public legal audio APIs directly from this Windows 11 machine on **2026-10-28**:

| Source | Endpoint Tested | API Key Needed? | Live Test Result on Machine | Per-Track License Metadata | Direct Audio Stream & Download |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Internet Archive (`archive.org`)** | `https://archive.org/advancedsearch.php` + `https://archive.org/metadata/{id}` | **No** | **200 OK** (`234 ms` query time) | `licenseurl` field (`Public Domain`, `CC0`, `CC BY`, `CC BY-NC`, `CC BY-SA`) | Direct `.mp3` / `.flac` / `.ogg` / `.wav` via `https://archive.org/download/{id}/{file}` |
| **2. Wikimedia Commons (`commons.wikimedia.org`)** | `https://commons.wikimedia.org/w/api.php?action=query&generator=search...` | **No** (requires descriptive `User-Agent`) | **200 OK** (`~300 ms` query time) | `extmetadata.LicenseShortName` & `LicenseUrl` (`Public domain`, `CC0`, `CC BY`, `CC BY-SA`) | Direct `.ogg` / `.wav` / `.mp3` / `.flac` via `imageinfo[0].url` |
| **3. Jamendo Music (`api.jamendo.com`)** | `https://api.jamendo.com/v3.0/tracks/` | **Yes** (`JAMENDO_CLIENT_ID` in `.env`) | Documented v3.0 REST API | `licenses` object + `license_ccurl` (`CC BY`, `CC BY-NC`, etc.) | Direct `.mp3` / `.flac` when `audiodownload_allowed == true` |
| **4. Openverse (`api.openverse.org`)** | `https://api.openverse.org/v1/audio/` | Anonymous throttled; OAuth2 recommended | **Timed out** (`Client.Timeout exceeded` after 60s) | `license` + `license_version` | Rejected due to live connection timeout on user's network |

---

## 3. Detailed Comparison of the Two Recommended Sources

### Option 1: Internet Archive Open Audio Catalogue (`archive.org`)
- **Official Documentation:**
  - Advanced Search JSON API: `https://archive.org/advancedsearch.php` (Accessed 2026-10-28)
  - Item Metadata API: `https://archive.org/developers/md-read.html` (Accessed 2026-10-28)
  - Terms of Use: `https://archive.org/about/terms.php` (Accessed 2026-10-28)
- **How We Filter for Legal Music Only:**
  - Query restricts results to `mediatype:audio AND licenseurl:(*creativecommons* OR *publicdomain*) AND NOT collection:librivoxaudio` so results are openly licensed music/songs rather than spoken-word audiobooks.
  - For each search hit, a lightweight metadata fetch (`https://archive.org/metadata/{identifier}`) locates the primary `.mp3`, `.flac`, `.ogg`, or `.wav` file (under the configured `MAX_UPLOAD_SIZE_MB` limit), its exact duration, file size, and human-readable license badge (e.g. `Public Domain`, `CC BY 4.0`, `CC BY-NC-SA 3.0`).
- **Pros:**
  - Works out of the box with **zero API keys**.
  - Huge variety of full-length songs, live bands (gospel, jazz, rock, folk, classical, acapella), and historical recordings in standard `.mp3` format.

### Option 2: Wikimedia Commons Open Audio (`commons.wikimedia.org`)
- **Official Documentation:**
  - MediaWiki Action API (`imageinfo` / `extmetadata`): `https://www.mediawiki.org/wiki/API:Imageinfo` (Accessed 2026-10-28)
  - Wikimedia Foundation User-Agent Policy: `https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy` (Accessed 2026-10-28)
  - Commons Licensing Policy: `https://commons.wikimedia.org/wiki/Commons:Licensing` (Accessed 2026-10-28)
- **How We Filter for Legal Music Only:**
  - Queries namespace `6` (`File:`) with `filetype:audio` + user keywords, requesting `iiprop=url|size|mime|extmetadata`.
  - Wikimedia Commons strictly forbids non-free content: every file is guaranteed to be `Public Domain`, `CC0`, `CC BY`, or `CC BY-SA`.
  - Returns file `url`, `duration`, `size`, artist, and `LicenseShortName` in a **single HTTP request**.
- **Pros:**
  - Works out of the box with **zero API keys**.
  - Single-request search returns direct audio URLs, durations, sizes, and verified free licenses immediately.
- **Cons:**
  - Many files on Wikimedia Commons are encoded as `.ogg` / `.oga` (Ogg Vorbis) or `.wav`, and the catalog leans toward classical, traditional, anthems, and folk recordings rather than modern studio pop. (Note: our FFmpeg pipeline and `audioValidation.js` already support `.ogg`, `.wav`, `.mp3`, and `.flac` natively!)

### Optional Bonus: Jamendo Music API v3.0 (`api.jamendo.com`)
- **Official Documentation:** `https://developer.jamendo.com/v3.0/tracks` (Accessed 2026-10-28)
- Requires registering a free developer application to get a `JAMENDO_CLIENT_ID` stored in `backend/.env`. Only tracks with `audiodownload_allowed: true` may be downloaded.

---

## 4. Recommendation

We recommend enabling **both Option 1 (Internet Archive) and Option 2 (Wikimedia Commons)** via a source selector pill in the **Discover** tab (defaulting to **Internet Archive** for full-length songs, with one-click switching to **Wikimedia Commons**), because neither requires an API key, both responded in `<300ms` during live testing on your machine, and both provide explicit per-track Creative Commons / Public Domain license metadata.
