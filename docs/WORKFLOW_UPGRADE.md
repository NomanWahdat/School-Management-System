# Classroom and finance upgrade — 16 October 2026

Implemented locally and ready for source review. [PostgreSQL rollout instructions](POSTGRESQL_RLS.md) describe the separate Neon migration/runtime roles required before production activation. Existing school data and credentials were retained; the user's requested separate demo is named **Kabul School** (`kabul-school`).

## Delivered workflows

- Grades 1–12, editable sections A/B/etc., and subject templates from the Ministry's published textbook catalogue. Legacy grade labels such as `Grade 8` remain accepted and normalize to numeric grades on save.
- Attendance is explicitly confirmed as saved. A saved register shows the staff name, teacher ID/admin username, role, time and revision. Retakes require a reason and preserve previous register snapshots. Version conflicts ask the user to reload rather than overwrite another staff member's changes. Administrators can correct; schools can enable/disable corrections by assigned teachers. Teachers can see a register saved by an administrator.
- Weekly class and teacher timetables, school-branded print layout and an explicit Manage lessons flow. Conflict checks reject overlapping teacher or class lessons. Assigned teachers can view their classes' complete schedules and their own teacher schedule.
- Search students by name/ID while creating an invoice; billing month; duplicate monthly-invoice constraints; outstanding balance, collected amounts and overdue summaries; complete per-student statements with payment history and printing; payment reference/notes and retry keys preventing double collection. Existing receipts are retained.
- In-app notifications for attendance, assignments, examinations, timetable additions and payments, plus overdue-fee and upcoming-exam reminders. Personal school scope, unread counts, mark-read actions and one-minute polling are implemented. SMS/email/push delivery is not configured.
- PostgreSQL FORCE RLS on 18 tables with transaction-local context. Separate migration/runtime connections, read-only runtime verification and build/start gates prevent serving through a database owner/bypass role. GitHub verification runs backend/browser checks and a PostgreSQL 17 restricted-login exercise.

## Demo evidence

Kabul School contains 24 classes (grades 1–12, A and B), 288 students with guardian contacts/enrollment histories, 48 teachers, 720 conflict-free weekly lessons, 48 exams, 792 results, 48 homework assignments, 576 monthly invoices and 288 payments. Attendance includes saved historical registers. All names, contacts and money are synthetic; a visible banner identifies the demo. No real money is due. Existing local accounts are linked through memberships without password changes; no shared demo passwords were generated.

The original school still has its 40 students, 10 teachers and 4 classes. A second verified backup was made before this upgrade at `backups/school-before-workflow-upgrade-20261016.sqlite3`. A representative legacy copy passed the full migration chain with original IDs/values preserved. The local database now has 36 integrity triggers. Every demo invoice balance and all timetable overlaps were checked after seeding.

Sign out/in to refresh memberships, select **Kabul School**, or open `http://127.0.0.1:5173/?school=kabul-school`. In another environment run `python manage.py create_school_demo --admin <existing-authorized-admin>` once after migrations; the demo rows are ignored local database data and are not included in a Git push. Re-running the command does not duplicate or reset an existing demo school.

## Verification

- Backend: **72 tests passed** (final run: 101.315 seconds), including cross-school isolation, migration reversals/preservation, attribution, retakes, stale-register conflicts, teacher policy, sections/curriculum, duplicate invoices, statements, personal notifications and payment retry safety.
- Browser: **9 flows passed** (final run: approximately 1.5 minutes) using installed Edge and a separate sample database/media directory. The additional flow verifies attendance correction, student search, invoice/statement, class and teacher timetable views, printable controls and notifications; it asserts no HTTP 500 responses.
- PostgreSQL 17: the actual migrations and FORCE policies passed through a separate non-owner, non-superuser, non-BYPASSRLS login. Tests exercise unscoped reads/writes, missing scope, A/B context switching, M2M rejection, JWT API lists/details/dashboards/notifications, invoice/payment/attendance writes and cleanup after requests/transactions. The actual Neon pool still requires verification.
- TypeScript/Vite production build passed. Django model/migration consistency and local ownership checks passed.

The initial architecture and role matrix remain in [MULTI_TENANCY.md](MULTI_TENANCY.md). The 15 October [verification report](VERIFICATION.md) is retained as historical evidence; this report supersedes its old RLS limitation.

## Design and rollout limits

School approval is needed for actual subject plans and teaching hours: these are editable templates, not a guarantee of every school's current syllabus. Retake permission is a school setting, not an asserted national rule. Date entry remains Gregorian; the existing Solar Hijri display option remains. Notification messages include event context; school/user entered content remains as written rather than being machine-translated. Live Neon/Vercel/Render activation requires their actual access/configuration. Review the release branch and role rollout before changing the production branch.

## Original implementation plan

Implementation order: curriculum templates and sections; attributed attendance sessions with immutable retake history and configurable teacher permissions; class/teacher weekly printable timetables; searchable invoice/payment flows and student statements; school-scoped in-app notifications; realistic isolated demo school; PostgreSQL RLS and restricted-role tests; GitHub delivery.

The curriculum templates reference https://moe.gov.af/dr/node/450 and remain editable by each school. There is no assumption that a national rule permits or forbids attendance corrections: the school controls teacher retakes, administrators can correct, and revisions are retained.

RLS design: enable and FORCE policies on school-owned tables, including the teacher/class join table. Bind verified school context with transaction-local `set_config`; never use session-level settings on pooled connections. Platform authentication, schools and memberships remain platform records. A separate migration/owner connection provisions policy/schema; Render uses a non-owner, non-superuser, non-BYPASSRLS login. Verification must run using that restricted role; a PostgreSQL administrator connection is not evidence of isolation. Existing SQLite ownership triggers remain active. Neon activation requires the deployment's actual connection/role to pass the verification command.

Demo data is synthetic and must be clearly labeled. Unless the user selects replacement, create a separate school and retain the existing school and accounts. Demo data never loads automatically on every deploy.
