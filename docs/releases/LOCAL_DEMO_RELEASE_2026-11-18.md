# Pacific Spaceport — Local/Demo Release Candidate

Record date: November 18, 2026. Scope: **trusted single-machine local development/demo, loopback-only**. This is not production deployment approval or full accessibility acceptance.

This record synchronizes the supplied Phase 7D.1 evidence with the actual local checkout. It does not copy application files from the older extracted snapshot. No application code, tests, dependencies, schemas, migrations or persistent databases were changed by Phase 7D.2.

## Candidate identity

| Field | Recorded value |
| --- | --- |
| Candidate label | `local-demo-2026-11-18` |
| Branch | `main` |
| Base HEAD | `1322d2e9885e4bf59494790b7ad8d25b47e2121f` |
| Source state | Includes existing staged and unstaged changes; **HEAD is not the complete candidate** |
| Runtime/configuration/test/tool source digest | `eae86c524d3be4c34459fecab65d6439b056f35154a0a0fcf9cec86e2b620179` |
| Runtime source entries | 72 pre-existing non-Markdown files; full path list and hashes in the manifest |
| Full candidate file identity | [Working-tree SHA-256 manifest](LOCAL_DEMO_RELEASE_2026-11-18.manifest.json) |
| Dependency observations | [Tested environment](LOCAL_DEMO_RELEASE_2026-11-18.environment.json) |
| Fresh command output | [Verification transcript](LOCAL_DEMO_RELEASE_2026-11-18.verification.txt) |
| Release commit/tag | **Not created; owner sign-off remains pending** |

The manifest lists every existing tracked or nonignored candidate file except the manifest itself; it excludes databases, `.git`, environments, caches and generated builds according to Git's source enumeration. The runtime digest covers the 72 original non-Markdown source/configuration/test/tool files; release metadata is excluded from that digest. Its input is the sorted path-to-hash mapping serialized with compact JSON (`sort_keys=True`, `separators=(',', ':')`) and UTF-8 encoding. The full payload digest applies the same method to all manifest entries, including this record, the README and release environment/verification files. Excluding the manifest itself avoids a self-referential hash.

Git HEAD, short status, staged entries and staged/unstaged patch hashes are recorded separately. Untracked release documents are covered by file hashes even though `git diff` does not include them. A source archive and complete patches are supplied with this consolidation's output so the exact uncommitted candidate can be preserved without relying on temporary audit directories. Retain that archive separately or create the reviewed release commit before treating the candidate as a long-lived baseline. No commit, tag or staging operation was performed here.

## Accepted OPS-001 implementation

The local `backend/main.py` uses authoritative SQLite result names before falling back to message text only when no result name exists. `tests/test_api.py` contains the additional real SQLite regression for a nonexistent table named `database is locked`: its `SQLITE_ERROR` remains HTTP 500.

| File | Accepted SHA-256 |
| --- | --- |
| `backend/main.py` | `7dfcbf18b361d61a298fdf0ccfdb5207d69d152649b4a7469eb85a88604ea435` |
| `tests/test_api.py` | `28326a3d0f2e84f0694c9e57351523aa16fefd82b30d2796561add6113fc9ec2` |

These local files were checked against the accepted Phase 7C.1 hashes and were not overwritten. The package's original 110-test total was increased to **111** by that precedence regression. Recognized SQLite availability failures return safe JSON 503, unexpected SQLite operational errors return safe JSON 500, and server-side exception logs retain diagnostics. Existing busy-write messages, 409 conflicts, transaction rollback and booking rules remain intact.

## Tested environment

Observed on macOS 26.6.2, Apple Silicon:

- CPython **3.12.16**; bundled SQLite **3.53.1**.
- Node **24.14.1** and npm **11.11.0**.
- FastAPI **0.162.0**, Uvicorn **0.54.0**, Pydantic **2.14.2**, pytest **9.2.0**.
- React/React DOM **19.3.1**, Vite **6.4.5**, Vitest **5.1.0**.
- All installed direct frontend versions match `frontend/package-lock.json`.

The environment JSON records every installed backend package version, direct frontend versions and dependency-file hashes. This is an observed tested environment, not a new dependency policy. Backend requirements still use ranges; this record is not a cross-platform lockfile. No fresh dependency installation, network package download or other-OS setup was certified during this phase. Use `npm ci` with the committed frontend lockfile when preparing a new environment, and rerun verification rather than assuming that a fresh backend range resolution reproduces these versions.

## Fresh Phase 7D.2 verification

The [verification transcript](LOCAL_DEMO_RELEASE_2026-11-18.verification.txt) records actual commands, complete output and the local timestamp. The candidate checks are:

| Check | Fresh result |
| --- | --- |
| Backend regression suite | **111 passed** |
| Frontend regression suite | **172 passed across 18 files** |
| Frontend formatting | Passed |
| Vite production build | Passed |
| Working and staged whitespace | Passed |
| Migration-copy verification | Two passes; preserved 5 spacecraft / 2,449 bookings and installed 5 triggers |
| SQLite checkpoint and independent recovery copy | Matching schema and every table's records; integrity `ok`, no foreign-key violations |
| Existing cancellation history in checkpoint | 2,442 confirmed / 7 cancelled; both statuses preserved |
| Protected launcher rejection checks | Original database and nonexistent path refused; no missing database created |
| Application/source database/staging safety | Application files, both persistent database hashes and pre-existing staged entries unchanged |
| Service cleanup | No task-owned service started; no listener on 8000/5173/5174 at closure |

The existing Starlette TestClient/httpx deprecation warning is nonblocking. Tests use private temporary databases. The migration verifier migrates a disposable backup twice; it does not initialize the selected source. No new browser run, benchmark or accessibility/device test is claimed for Phase 7D.2.

## Accepted runtime history

These observations were accepted in earlier local phases. They are not fresh runtime checks performed while editing this release record.

| Gate | Accepted evidence and qualification |
| --- | --- |
| Phase 7B live service | Browser → Vite → protected Uvicorn → disposable SQLite: booking 201, mission/refueling conflicts 409, cancellation 200, immediate Fleet updates without an extra booking GET, retained history and released availability |
| Concurrency regressions | Simultaneous conflicting bookings yield one 201 and one 409 with one row; simultaneous cancellation yields one 200 and one 409. In-process tests, not a live stress/load benchmark |
| Phase 7C recovery | Consistent SQLite backup/restore, graceful and forced idle-worker restart, rollback of an uncommitted writer, and migration preservation passed. No power/device-loss certification |
| Phase 7C.1 OPS-001 | Real exclusive-lock reads, read-only writes and unavailable paths return JSON 503; busy writes and 409 conflicts preserved; unrelated schema error JSON 500. Physical disk-full/I/O failures not reproduced |
| Phase 7C.2 browser recovery | All eight scenarios passed: Charter 503/Retry, Fleet 503/Refresh, booking 503 without false success, committed booking with dropped response, cancellation 503 and safe status-verified recovery |
| Ambiguous response | The relay dropped a real upstream 201; SQLite and Fleet showed exactly one committed reservation before another write. No automatic duplicate booking POST observed; no exactly-once guarantee |

Phase 7C.2 used **608×917** CSS pixels for Charter/Fleet recovery and **1280×720** for lost-response handling. It did not repeat all scenarios at both sizes. Previously loaded Fleet records remained visible alongside persistent failure feedback; no separate freshness badge is required for this scope.

After a failed cancellation submit, page-root focus was observed; the next Tab returned to Keep reservation through the existing containment handler. The dialog remained keyboard-operable. Retain that observation for the outstanding VoiceOver modal tests; it is not a confirmed new defect or a reason for a speculative focus patch.

## Validation commands

From the repository root:

```bash
git status --short --untracked-files=all
git rev-parse HEAD
git diff --check
git diff --cached --check
backend/.venv/bin/python -m pytest -q tests
export APP_DB="$PWD/backend/local-data/spaceport-qa.db"
test -f "$APP_DB" || { echo 'Expected QA database missing; stop'; exit 1; }
backend/.venv/bin/python tools/verify_database_migration.py --source "$APP_DB"
cd frontend
npm run format:check
npm test
npm run build
cd ..
```

Investigate unexpected count changes rather than modifying tests merely to restore a number. Future-date fixtures must eventually advance as real time passes; never disable past-booking validation to keep a dated fixture passing. The latest full suite is not a permanent test-count guarantee.

## Protected local startup

The persistent QA database is `backend/local-data/spaceport-qa.db`. It is Git-ignored and must already exist. Do not create another `spaceport.local.db` simply to follow an example.

Terminal one, repository root:

```bash
backend/.venv/bin/python tools/run_backend_dev.py --db backend/local-data/spaceport-qa.db
```

Check the printed absolute path. The launcher rejects the original `backend/spaceport.db` path and nonexistent files, sets `SPACEPORT_DB` for Uvicorn/reload, and binds to **127.0.0.1:8000**. Importing `main.py` still performs initialization/migrations; startup is not a read-only operation. Do not run direct Uvicorn with `SPACEPORT_DB` unset. The `.env` file is not loaded automatically.

Terminal two:

```bash
cd frontend
npm run dev
```

Keep Vite on **127.0.0.1:5173** with its existing `/api` proxy. Do not expose a local demo using `0.0.0.0`, a public tunnel or an untrusted shared network. No authentication or reservation-ownership authorization exists; CORS is not authentication. Stop both services with Ctrl+C after verification or demo use. Check occupied ports before starting another instance, without killing unrelated processes.

For booking/cancellation QA, select a separate consistent disposable backup, not the persistent QA file or the original database. After a booking/cancellation transport failure, inspect Fleet and, if necessary, the selected database before manually retrying. Do not add automatic write retries without an idempotency design.

## Checkpoint, restore and data-preserving rollback

1. Stop writers and confirm the selected existing database. Preserve the reviewed source artifact, environment, logs and database path before changing source.
2. Use SQLite's backup API to create a checkpoint at a **new filename**. Validate integrity, foreign keys, schema, full records, status counts and installed guards; retain its hash and timestamp. Do not rely on a plain file copy while a server is writing or on OS temporary directories for long-lived checkpoints.
3. Test a restoration into another **new destination**, then verify it before selecting it through the protected launcher. Do not overwrite the original/current database during investigation. Seed JSON import is not a cancellation-history restore format.
4. Before source rollback, checkpoint the **current** database again. Test the previous source artifact against a fresh copy of that current data, including migrations, triggers, all bookings and cancellation history.
5. Only switch source while keeping current data if compatibility is verified. An older snapshot can omit reservations/cancellations created later. If compatibility is unknown or fails, stop writes and plan a reviewed forward fix or reconciliation; do not restore the old snapshot over current records merely to make old code start.

Previous-version compatibility was **not tested**, because no previous release artifact was executed. This is a rollback safeguard, not a completed rollback certification. No zero-data-loss RPO or recovery-time objective is established.

Example checkpoint from the root, after setting `APP_DB` as above and stopping writers:

```bash
backend/.venv/bin/python - <<'PYBACKUP'
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

source = Path(os.environ['APP_DB']).resolve(strict=True)
if not source.is_file():
    raise SystemExit(f'Database not found: {source}')
folder = source.parent / 'backups'
folder.mkdir(exist_ok=True)
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
target = folder / f'spaceport-checkpoint-{stamp}.db'
fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
os.close(fd)
with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as src:
    with sqlite3.connect(target) as dst:
        src.backup(dst)
with sqlite3.connect(target.as_uri() + '?mode=ro', uri=True) as db:
    integrity = db.execute('PRAGMA integrity_check').fetchone()[0]
    foreign_keys = db.execute('PRAGMA foreign_key_check').fetchall()
    counts = {table: db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
              for table in ('ships', 'bookings')}
if integrity != 'ok' or foreign_keys:
    raise SystemExit(f'Checkpoint failed verification: {target}')
print('Checkpoint:', target)
print('Integrity:', integrity)
print('Foreign-key violations:', len(foreign_keys))
print('Counts:', counts)
PYBACKUP
```

This example does not overwrite an existing destination. It records basic checkpoint checks; full row/schema/status/trigger comparison and a separate restore rehearsal remain necessary. A failed checkpoint should be retained for diagnosis, not mistaken for a valid backup. The release verification used disposable checkpoint/recovery files and did not create another persistent QA database.

## Known limits and phase status

| Area | Status |
| --- | --- |
| Phase 7A — Accessibility | **Open: 4/14 accepted; 10 device checks inconclusive** |
| Phase 7B — Local functional readiness | Passed for local/demo scope |
| Phase 7C / OPS-001 / browser recovery | Closed for local/demo scope |
| OPS-002 — Direct-import DB creation/migration | Existing risk; protected launcher is the local mitigation |
| OPS-003 — Older-source rollback compatibility | Unverified; preserve current records and test a copy before rollback |
| Phase 7D — Release consolidation | Candidate identified and documentation synchronized; owner sign-off and any commit/tag pending |
| Production deployment | Not assessed or approved |

The ten device checks are six VoiceOver/Safari scenarios, three physical-touch scenarios and one actual 400% zoom scenario. They are pending, not failed or passed; they block full accessibility acceptance. Cancellation-focus and screen-reader modal-background traversal remain observations for that work. Do not reinterpret local/demo functional acceptance as accessibility conformance.

Physical disk-full/I/O, power failure, device loss, off-machine restore, backup-retention automation, load/stress capacity, formal RPO/RTO, fresh-install reproducibility and previous-version rollback remain unestablished. Dependency ranges are not an environment lock. A static build does not configure production API routing, supervision, TLS or security. No additional source change is justified merely to mark these items complete.

## Candidate sign-off

- [x] Scope is trusted, loopback-only local/demo.
- [x] Actual local OPS-001 code precedence and regression preserved.
- [x] HEAD plus exact working-tree manifest and dependency environment recorded.
- [x] Fresh frontend/backend, format/build, migration-copy and whitespace results recorded.
- [x] Consistent checkpoint and recovery copy preserve status/history/schema/guards.
- [x] Original and persistent QA hashes and pre-existing staging unchanged; no task service left running.
- [x] Ten pending device checks and rollback limitations remain explicit.
- [ ] Owner accepts this exact uncommitted candidate or creates/reviews its release commit/tag.
- [ ] Record the final committed source revision after any such commit; regenerate identity if the candidate changes.

Engineering evidence supports this **scoped local/demo candidate**. Formal owner sign-off remains separate. No commit, tag, merge, deployment or application patch was performed by this documentation phase.
