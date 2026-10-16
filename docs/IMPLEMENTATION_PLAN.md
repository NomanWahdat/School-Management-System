# School workspaces implementation plan

The existing React/Vite frontend, Django REST API, JWT accounts, PostgreSQL deployment and SQLite development database remain. The UI will be redesigned around visible, labeled actions and school branding.

## Isolation strategy (before migrations)

Use a shared database with a non-null `school_id` on every school-owned model. A request-local ContextVar carries only backend-verified context. Default ORM managers fail closed without that context. Explicit unscoped managers are limited to authentication, platform provisioning, migration, validation commands and test setup. Ordinary school endpoints never bypass isolation for superusers.

Users, schools, memberships and platform audit events are platform-wide. Memberships carry the admin/teacher roles and unique `(user, school)` identity. Classes, students, teachers, attendance, exams/results, invoices/payments, homework, announcements, school settings, guardians, enrollment history and school audit events are school-owned.

JWTs bind a session to a school. Switching checks active membership and issues school-bound tokens; it does not change a user's process-global or server-global current school. The frontend cancels outstanding requests, clears all school data and drafts, and keys the workspace to school/session identity. Requests include an expected school header; mismatches fail instead of silently writing in another school. Account, school and membership status are checked on each request and refresh.

Use database triggers on SQLite and PostgreSQL for same-school foreign keys and teacher/class assignments, in addition to scoped serializer relations. PostgreSQL RLS is deferred: the deployment's actual runtime role and transaction-pooled connection behavior are not verified. No RLS claim will be made.

## Existing data

Prepare a reversible schema migration with nullable school references, then a data migration that validates ownership before creating the legacy school and memberships. Report conflicting class/student/exam relationships and conflicting account roles instead of guessing. Preserve IDs, records, and original branding. Add non-null references and school-specific uniqueness only after validation. Test both fresh and representative legacy databases. Do not apply migration to the user's existing database without first making a backup and validating its contents.

## Implementation and checks

1. Add tenant models, scoped managers, memberships, audit log and integrity rules.
2. Repair JWT/session handling and add platform provisioning/suspension endpoints.
3. Scope and validate all existing school endpoints; repair attendance, timetable, fees and announcements.
4. Add guardians, enrollment/promotion history, branded report cards/receipts, safe CSV exports and follow-up lists.
5. Redesign the frontend with responsive layouts, visible actions, focused forms, Dari/Pashto messages, Kabul dates and calendar options.
6. Add migration, role, isolation, stale-context, bulk, financial and frontend-state tests. Run backend checks/tests and production frontend build.
7. Document the request flow, inventory, role matrix, backup/rollback/deployment and verification limits.
