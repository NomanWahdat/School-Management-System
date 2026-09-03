# School Management System

React/Vite frontend and Django/DRF backend for school administration.

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
4. Use build command `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`.
5. Use start command `gunicorn school_management.wsgi:application`.
6. Configure these Render environment variables:

```text
DJANGO_SECRET_KEY=<long-random-secret>
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=<your-render-host>.onrender.com
DATABASE_URL=<Neon pooled connection string>
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

The repository intentionally ignores `backend/db.sqlite3`. If you need to move local records to Neon, export them before deployment:

```powershell
.\.venv\Scripts\python.exe backend\manage.py dumpdata --natural-foreign --natural-primary --exclude contenttypes --exclude auth.permission --indent 2 > backend\data.json
```

After temporarily pointing `DATABASE_URL` to Neon and running migrations:

```powershell
.\.venv\Scripts\python.exe backend\manage.py loaddata backend\data.json
```

Do not commit `data.json` if it contains private school data.

## Production checks

```powershell
.\.venv\Scripts\python.exe backend\manage.py check --deploy
Push-Location frontend; npm run build; Pop-Location
```

Never commit `.env` files, database passwords, JWT secrets, R2 credentials, `db.sqlite3`, `media/`, `node_modules/`, or `dist/`.
