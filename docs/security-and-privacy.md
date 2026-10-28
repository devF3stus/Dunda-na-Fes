# Security and Privacy ("Dunda na Fes")

**Last Updated:** 2026-10-28 (Phase 8 — Final Audit)

---

## 1. Local-Only Binding (`127.0.0.1`)

- Both the Express backend (`backend/src/index.js`) and the Vite dev server (`frontend/vite.config.js`) bind explicitly to **`127.0.0.1`** (the IPv4 loopback address), **never** `0.0.0.0` (all network interfaces).
- **Why this matters:** When a server binds to `0.0.0.0` on Windows, other devices on the same Wi-Fi/LAN (such as a coffee shop or shared home network) can potentially reach your port. Binding to `127.0.0.1` guarantees the OS kernel rejects any packet that did not originate on your own computer.
- **No Authentication Needed:** Because only processes running under your Windows session on your own PC can reach `127.0.0.1`, user accounts, passwords, and session tokens are unnecessary.

---

## 2. Audio Privacy Guarantee

- **Your audio files never leave your computer during separation.**
- AI inference runs 100% locally inside `separator/.venv` using ONNX Runtime on your AMD Ryzen 5 PRO 4650U CPU.
- **Only two features ever use the network:**
  1. Downloading an ONNX model weight file (`UVR-MDX-NET-Inst_HQ_3.onnx` or `Kim_Vocal_2.onnx`) **once** into `storage/models/` if it is not already cached.
  2. Searching and downloading openly licensed music in the **Discover** tab (`archive.org` and `commons.wikimedia.org`).

---

## 3. Defense-in-Depth Protections (Even on Localhost)

Even for a single-user localhost app, we enforce strict server-side protections:
1. **Upload & Corruption Safety (Phase 4 / Phase 8):**
   - Only allowed audio formats (`.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`) within `MAX_FILE_SIZE_MB` (`100 MB` default) are accepted.
   - Uploaded files are inspected by reading their binary file headers (magic bytes), not trusting the browser's `Content-Type` header or filename extension alone.
   - `probeAudioDurationSeconds()` verifies that `ffprobe` can decode the container and reports a positive audio duration, rejecting truncated or corrupt files with `400 CORRUPT_AUDIO_FILE` and deleting the temporary upload file immediately.
   - Server-generated UUID filenames are used on disk; user-supplied display names are stored in SQLite metadata and sanitized (`< > : " / \ | ? *` and Windows reserved names stripped) when generating download filenames, making path traversal (`../`) impossible.
2. **Strict SSRF Domain Allowlist on Discover Downloads (Phase 7):**
   - `POST /api/discover/stage` validates `audioUrl` through `validateAllowedDiscoverAudioUrl()`, enforcing `https:` only and restricting hostnames strictly to `archive.org`, `*.archive.org`, `upload.wikimedia.org`, and `commons.wikimedia.org`. Arbitrary URLs, private IP addresses, and unapproved domains are rejected with `400 UNAPPROVED_SOURCE_DOMAIN`.
3. **No Raw Stack Traces:**
   - `backend/src/middleware/errorHandler.js` and `separator/separate.py` catch unexpected errors (including `ENOSPC` disk-full conditions) and return clean, human-readable JSON messages to the UI.
4. **No Secrets in Git:**
   - `.gitignore` excludes `.env`, `storage/` (except `.gitkeep`), `node_modules/`, and `separator/.venv/`.

---

## 4. What Would Need to Change If Ever Exposed Beyond Localhost?

If this app were ever deployed on a LAN or the public internet (which is outside the scope of this project), you would need to add:
- TLS/HTTPS termination (reverse proxy like Caddy or Nginx).
- User authentication and per-user authorization on every API route and audio stream.
- Rate limiting and per-user disk quotas (since 1-at-a-time CPU separation and disk storage could be easily exhausted).
- Strict CORS and CSRF protections.
