# School Management System

React/Vite frontend and Django/DRF backend for school administration.

The system now supports independent school workspaces, a Platform Super Admin,
membership-based School Admin/Teacher permissions, school branding and a redesigned
English/Dari/Pashto interface. Read [the architecture, migration and deployment guide](docs/MULTI_TENANCY.md)
before upgrading an existing database. Verification evidence is in [docs/VERIFICATION.md](docs/VERIFICATION.md).

The classroom/finance upgrade adds grades 1–12 sections, attributed attendance retakes,
printable weekly class/teacher schedules, student statements, in-app notifications and
the synthetic **Kabul School** demo. PostgreSQL RLS is implemented; follow the
[required Neon runtime-role rollout](docs/POSTGRESQL_RLS.md) before production deployment.

## Deployment architecture

- Frontend: Vercel
- Django API: Render Free
- Database: Neon PostgreSQL
- Uploaded logos/media: Cloudflare R2 or another S3-compatible bucket

## Local development

### Backend

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python backend\manage.py migrate
python backend\manage.py runserver
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Copy `frontend/.env.example` to `frontend/.env.local` for local API configuration.

## Deploy the backend to Render

1. Create a Neon project and copy its pooled PostgreSQL connection string.
2. In Render, create a Web Service from this repository, or use the included `render.yaml` Blueprint.
3. For manual configuration, use root directory `backend`.
4. Use build command `pip install -r requirements.txt && python build.py`.
5. Use start command `python start.py`.
6. Configure these Render environment variables:

```text
DJANGO_SECRET_KEY=<long-random-secret>
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=<your-render-host>.onrender.com
DATABASE_URL=<Neon pooled connection string using restricted school_runtime login>
MIGRATION_DATABASE_URL=<Neon direct connection string using schema owner>
CORS_ALLOWED_ORIGINS=https://<your-vercel-domain>.vercel.app
CSRF_TRUSTED_ORIGINS=https://<your-vercel-domain>.vercel.app
DJANGO_SECURE_SSL_REDIRECT=False
```

`DJANGO_SECURE_SSL_REDIRECT=False` is intentional for Render's proxy setup. Django trusts the forwarded HTTPS header.

Run the first admin setup from the Render Shell:

```bash
python manage.py createsuperuser
```

## Configure Cloudflare R2 media storage

Create an R2 bucket and an R2 API token with object read/write access. Add these Render variables:

```text
AWS_ACCESS_KEY_ID=<r2-access-key>
AWS_SECRET_ACCESS_KEY=<r2-secret>
AWS_STORAGE_BUCKET_NAME=<bucket-name>
AWS_S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
AWS_S3_REGION_NAME=auto
AWS_S3_CUSTOM_DOMAIN=<public-r2-domain-or-custom-media-domain>
```

The bucket must be publicly readable through `AWS_S3_CUSTOM_DOMAIN`, or you must configure a custom domain/public access route. Never put R2 credentials in the frontend or commit them to Git.

Without these variables, local development stores media under `backend/media/`.

## Deploy the frontend to Vercel

1. Import this GitHub repository into Vercel.
2. Set the project Root Directory to `frontend`.
3. Use the included `frontend/vercel.json`, or configure build command `npm run build` and output directory `dist`.
4. Add this Vercel environment variable:

```text
VITE_API_URL=https://<your-render-host>.onrender.com
```

The frontend automatically appends `/api` to this value. Do not include `/api` in `VITE_API_URL`.

After Vercel gives you a domain, update the Render CORS and CSRF variables with the exact Vercel URL.

## Existing SQLite data

Before the multi-school upgrade, back up the database, run the ownership preflight
and test a migrated copy as described in [the migration guide](docs/MULTI_TENANCY.md#backup-and-migration).
Existing records are preserved in the `existing-school` workspace; old sessions must sign in again.

The repository intentionally ignores `backend/db.sqlite3`. For a move to Neon, use
a tested database migration/backup process. Do not run an unscoped `dumpdata` of
school-owned models: their default managers intentionally require verified school
context. Legacy JSON fixtures lack required school ownership and cannot be loaded
directly into the upgraded schema. A SQLite-to-PostgreSQL transfer needs a separate,
tested data conversion preserving schools, memberships, original IDs, password
hashes, relationships and sequence values. Verify the restored data and PostgreSQL
ownership guards before directing users to it. Do not commit exported school data.

## Production checks

```powershell
.\.venv\Scripts\python.exe backend\manage.py check --deploy
Push-Location frontend; npm run build; Pop-Location
```

Never commit `.env` files, database passwords, JWT secrets, R2 credentials, `db.sqlite3`, `media/`, `node_modules/`, or `dist/`.
