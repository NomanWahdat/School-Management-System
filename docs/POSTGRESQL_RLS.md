# PostgreSQL RLS rollout (Render + Neon)

Migration `0017` implements ENABLE + FORCE ROW LEVEL SECURITY on 17 school-owned tables and the teacher/class assignment table. Ordinary PostgreSQL reads/writes, including `all_objects` and raw SQL, require the verified school transaction context. SQLite retains scoped managers and 36 relationship/ownership triggers; SQLite does not implement PostgreSQL RLS.

Every PostgreSQL API request runs in a transaction. Authentication checks the global user and membership; school permissions bind the verified ID using `set_config('app.school_id', ..., true)`. The final `true` makes the setting transaction-local. Nested internal `school_context` blocks restore their parent context, and commit/rollback clears settings before a pooled connection can be reused. Public branding only reads approved fields from the platform School record.

RLS is a defense against missing school filters, not arbitrary SQL execution by a compromised application: the trusted backend can establish the context. Platform users, schools, memberships, audit metadata and authentication infrastructure remain platform-wide and require application authorization. A school admin's signed token does not grant a PostgreSQL owner/bypass role.

## Required roles and environment

Use two **different** connections. Never use the database owner as the running application's role.

- `MIGRATION_DATABASE_URL`: Neon **direct**, schema-owning administrative connection. Used only by `backend/build.py` for migrations. Keep it in Render secrets; never put it in Vercel/browser variables.
- `DATABASE_URL`: Neon pooled connection using a SQL-created restricted `school_runtime` login. It must not own protected tables, inherit their owner role, have `SUPERUSER`, `BYPASSRLS`, `CREATEROLE` or `CREATEDB`.

Create the runtime role in the Neon SQL console using a strong privately generated password. Replace the password and database identifier locally; do not paste credentials into chat:

```sql
CREATE ROLE school_runtime LOGIN PASSWORD '<private-generated-password>'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT CONNECT ON DATABASE "<your-database>" TO school_runtime;
GRANT USAGE ON SCHEMA public TO school_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO school_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO school_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE "<migration-owner>" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO school_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE "<migration-owner>" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO school_runtime;
```

Run the initial grants after migrations if the database is fresh; rerun grants when adding tables if default privileges were not configured for the actual migration owner. Do not grant TRUNCATE, schema CREATE, ownership or membership in the migration role to the runtime login. Keep database credentials on the backend.

## Deployment sequence

1. Take a verified Neon snapshot/backup and test a restore. Use a disposable Neon branch for rehearsal.
2. Configure both connection URLs above, exact frontend CORS origin, HTTPS/hosts and branding storage on Render. Render must run PostgreSQL 15 or later for the current Django version.
3. Set Render build command to `pip install -r requirements.txt && python build.py`; start command to `python start.py`. The Blueprint is updated too; existing manually configured services must update these dashboard commands themselves.
4. Build runs `collectstatic`, applies migrations with the owner connection and runs `check_rls` with the runtime connection. Startup repeats the runtime check and refuses to serve if the role bypasses or owns protected tables, or any policy is missing. This intentionally fails closed; do not disable it to get a green deployment.
5. In the Render shell run `python manage.py check_rls` with the runtime `DATABASE_URL`. Test school A/B, role switching, fees, attendance, platform provisioning and reports against the **actual pooled Neon connection** before promoting a release.
6. Point Vercel's `VITE_API_URL` to the Render API and rebuild after the API is ready. Vercel never connects directly to this database.
7. Run `python manage.py create_school_demo --admin <existing-admin>` once in the target environment if a demo is wanted there. It creates **Kabul School** without replacing records or resetting passwords. Existing local demo rows do not travel through Git.

The repository provides a tested release branch. A GitHub push alone does not prove that your existing Render dashboard commands or secrets have changed. Keep production on its current release until the role/configuration rehearsal passes.

## Verification

The Windows local verification uses downloaded official PostgreSQL 17 binaries in ignored test storage, starts an isolated cluster on loopback, applies the actual migration chain, creates a non-owner runtime login and exercises school A/B APIs plus database denials. It stops the server afterward. The archive is already present on this development machine; on a new Windows checkout, download it first:

```powershell
New-Item -ItemType Directory -Path backend/.verification -Force
curl.exe --fail --location --output backend/.verification/postgresql-17.zip https://get.enterprisedb.com/postgresql/postgresql-17.11-3-windows-x64-binaries.zip
```

```powershell
.\.venv\Scripts\python.exe -B scripts\run_local_postgres.py
```

For an existing disposable PostgreSQL test database named `test_school_*`, set `TEST_DATABASE_URL` privately to its administrative connection and run:

```powershell
.\.venv\Scripts\python.exe -B scripts\verify_postgres.py
```

It refuses other database names, provisions and removes a temporary restricted login, and rolls back synthetic fixture rows. It does not print passwords. It checks missing context, cross-school unscoped reads/updates/inserts, M2M guards, nested context restoration, API lists/details and post-request/transaction cleanup. `check_rls` itself is read-only and suitable for the real runtime connection.

The PostgreSQL 17 verification passed locally. The actual Neon runtime role, branch permissions and PgBouncer pool still need verification through an authorized Neon connection; they have not been claimed as verified.

## Operational limits

Maintenance commands that intentionally inspect **every** school must use a protected administrative connection or explicitly loop through authorized `school_context` blocks. Running an unscoped data-count command with the restricted role will correctly see no school rows. Migrations/restore operations need the owner connection and verified backups. Never roll a database containing multiple schools back to the old single-school application.

References: [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [Neon transaction pooling](https://neon.com/docs/connect/connection-pooling), [official Windows binaries](https://www.enterprisedb.com/download-postgresql-binaries).
