# ADR 0002: SQLite Driver Selection for Node.js on Windows

- **Date:** 2026-10-21
- **Status:** Approved (Option 2: Keep Node `v24.14.1` and use built-in `node:sqlite`)

---

## 1. Context

"Dunda na Fes" uses SQLite to store metadata for staged files, processing jobs, and completed library entries.
On Windows, traditional SQLite drivers for Node.js (`better-sqlite3`, `sqlite3`) are native C++ addons that can require `node-gyp` / Visual Studio C++ Build Tools if prebuilt binaries are unavailable or fail to download.

---

## 2. Options Evaluated

### Option 1: Upgrade Node.js via WinGet to `v24.20.0 LTS` and use `node:sqlite`
- Would require upgrading the system Node runtime.

### Option 2: Keep Node `v24.14.1` and use built-in `node:sqlite` (`DatabaseSync`) — *Selected*
- **Verified on Machine (2026-10-21):**
  ```powershell
  node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(':memory:'); db.exec('CREATE TABLE t(x INT); INSERT INTO t VALUES (42);'); console.log('node:sqlite OK:', db.prepare('SELECT x FROM t').get());"
  ```
  Result: `node:sqlite OK: [Object: null prototype] { x: 42 }` (Exit code 0).
- **Pros:**
  - Zero external npm dependencies for SQLite.
  - Zero `node-gyp` / C++ compilation issues on Windows.
  - Simple synchronous API (`db.prepare(...).get()`, `.all()`, `.run()`) ideal for teaching and local single-user persistence.

### Option 3: Keep Node `v24.14.1` and use `better-sqlite3` (`v13.0.3`)
- Third-party C++ addon (`MIT License`). Not needed since built-in `node:sqlite` works natively.

---

## 3. Decision

We will keep **Node `v24.14.1`** and use Node's built-in **`node:sqlite` (`DatabaseSync`)** module.

---

## 4. Sources

- Node.js v24 Official Documentation — `node:sqlite` (`DatabaseSync`): https://nodejs.org/api/sqlite.html (Checked 2026-10-21)
