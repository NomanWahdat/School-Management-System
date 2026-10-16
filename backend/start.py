"""Refuse to serve PostgreSQL through a role that bypasses the tenant policies."""
import os
import subprocess
import sys

if os.environ.get('DATABASE_URL', '').startswith(('postgres://', 'postgresql://')):
    subprocess.run([sys.executable, 'manage.py', 'check_rls'], check=True)
os.execvp('gunicorn', ['gunicorn', 'school_management.wsgi:application', '--bind', '0.0.0.0:' + os.environ.get('PORT', '8000')])
