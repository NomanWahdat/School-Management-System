# Verification report — 15 October 2026

This is the preserved initial-upgrade report. The 16 October classroom/finance/RLS upgrade supersedes its RLS and browser-storage limitations; see [WORKFLOW_UPGRADE.md](WORKFLOW_UPGRADE.md) and [POSTGRESQL_RLS.md](POSTGRESQL_RLS.md) for the current implementation and rollout.

The local implementation retains React/Vite, Django REST Framework and the existing authentication model. It adds school ownership, membership roles, explicit platform administration and a redesigned school workspace. Architecture, the tenant request-flow diagram, the data inventory, role matrix, deployment and rollback instructions are in [MULTI_TENANCY.md](MULTI_TENANCY.md).

## Final checks

| Check | Result | Environment |
| --- | --- | --- |
| Backend suite (`scripts/test_backend.py`) | 68 tests passed; 57.294 seconds | Isolated in-memory SQLite |
| Browser suite (`frontend/e2e/workspace.spec.ts`) | 8 tests passed; 56.7 seconds | Installed Microsoft Edge, isolated sample API/database/media |
| Frontend (`npm.cmd run build`) | TypeScript check and Vite production build passed | Local production bundle |
| Dependencies (`npm.cmd audit`) | 0 reported vulnerabilities | Installed frontend dependency tree |
| Django `check` | No issues | Local settings |
| `makemigrations --check --dry-run` | No changes detected | Models match migrations |
| `git diff --check` | Passed | Changes in working tree |
| Existing-data ownership validation | Passed; read-only | Migrated local school database |
| SQLite integrity check | `ok`; 30 ownership/relationship triggers present | Migrated local school database |

The npm audit is a point-in-time advisory check, not proof that dependencies are vulnerability-free. Local test output includes a missing collected-staticfiles directory warning; production must run `collectstatic` through its deployment build.

## Isolation evidence

School A/B API tests exercise lists, details, search, filters, pagination, dashboard totals, reports, CSV exports, report cards, receipts, bulk operations and related-record choices. Tests deny cross-school read/write/delete and foreign-key/M2M injection, school ownership payloads, forged school headers and privilege escalation. Missing context fails closed. Tests also cover suspended schools, revoked memberships, password/session revocation, rotating refresh tokens and explicit audited platform access.

Database tests attempt ownership changes and invalid cross-school relationships through trusted bulk/raw write paths and verify database rejection. Scoped query tests reject reuse under a different or missing context, including cached indexing and iterator consumption. These guards do not restrict trusted unscoped reads: `all_objects` and raw SELECT remain privileged maintenance capabilities. PostgreSQL RLS is not implemented.

The browser tests verify:

1. A token refresh whose JSON parsing finishes after switching schools or logging out cannot restore the old session or browser storage.
2. A delayed old-school list response cannot populate the new school, and switching discards unsaved forms.
3. Admission, attendance, exam marks, payment receipts and CSV reports work through the UI without browser page errors.
4. Teacher navigation and homework match permitted class/subject access.
5. Dari/Pashto mobile navigation uses RTL and fits a 390-pixel viewport.
6. Platform school provisioning, initial administrator creation and audit events work.
7. Guardians, branded report cards, promotion/enrollment history, logo decoding and calendar settings work.
8. Subject selection, teacher account creation, timetable entry and announcements work.

Tests use sample credentials and separate storage; they do not exercise or modify the user's existing school records. The suite shares one disposable sample API across its sequential browser flows. Screenshots from the final run are available locally at `frontend/test-results/admin-desktop.png` and `frontend/test-results/teacher-dari-mobile.png`; those artifacts are intentionally ignored by Git.

The mobile test was additionally rerun after strengthening its checks to wait for loaded pupil records and the closing navigation transition; it passed in 20.3 seconds including server startup. The final mobile screenshot shows the loaded attendance form.

## Existing school data

A verified SQLite backup was created before migrations at `backups/school-before-multitenancy-20261015.sqlite3`. A separate copy was migrated and compared with the source before the live local upgrade. Migrations through `0015` and JWT blacklist migrations were then applied locally. Final comparison opened both backup and live database read-only and confirmed **all original columns, IDs and password hashes match across all 16 original school tables**.

| Original record | Preserved count |
| --- | ---: |
| User accounts | 11 |
| Classes | 4 |
| Students | 40 |
| Teachers | 10 |
| Teacher/class assignments | 13 |
| Exams | 12 |
| Results | 36 |
| Timetable entries | 18 |
| Announcements | 1 |
| School settings | 1 |
| Attendance, invoices and payments | 0 each |

The migrated data belongs to `existing-school`, with 11 memberships and 40 initial enrollment-history rows. Legacy teaching weekdays are preserved from its timetable. Migration tests verify preservation and reject ambiguous ownership instead of guessing. No local media directory existed to copy; remote media/bucket backups were not performed.

## First platform login

No active Platform Super Admin exists in the original database, and school administrators were not automatically promoted. Create a dedicated owner from the project root and type its password privately in the terminal:

```powershell
.\.venv\Scripts\python.exe -B backend\manage.py setup_platform_owner --username platform-owner
```

Existing school usernames and password hashes remain preserved. Pre-upgrade sessions must sign in again. The guide also documents explicit promotion of a deliberately selected existing account.

## Remaining production checks and limits

- PostgreSQL migrations, ownership triggers, the actual runtime database role, pooled connections and concurrent transactions have not been exercised against Neon/PostgreSQL. Verify those in a disposable restored production database before rollout. No RLS protection is claimed.
- No remote deployment, external database change, hosting configuration change or publication was performed. HTTPS, host/origin settings, secrets, public branding storage and scheduled backup/restore checks require deployment verification.
- Moving the existing SQLite database into PostgreSQL requires a separate tested data conversion. Legacy JSON fixtures cannot be loaded directly into the required school-owned schema.
- Native date entry remains Gregorian; Solar Hijri is supported for display. Changed grading thresholds apply when results are saved; existing stored grades remain historical.
- File storage is outside database transactions; an interrupted logo operation can leave an orphaned public branding object. Student documents are not publicly stored.
- Email/SMS delivery, parent/student/accountant login roles, scheduled jobs, realtime subscriptions and offline synchronization were not existing compatible workflows and were not introduced.

Passing tests establish evidence for the covered behavior; they do not establish complete security or replace deployment verification.
