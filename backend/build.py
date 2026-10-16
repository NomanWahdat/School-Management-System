"""Render build: migrations use a direct owner URL; the runtime role is verified separately."""
import os
import subprocess
import sys

runtime = os.environ.copy()
migration = runtime.copy()
if runtime.get('MIGRATION_DATABASE_URL'):
    migration['DATABASE_URL'] = runtime['MIGRATION_DATABASE_URL']

subprocess.run([sys.executable, 'manage.py', 'collectstatic', '--noinput'], check=True, env=runtime)
subprocess.run([sys.executable, 'manage.py', 'migrate', '--noinput'], check=True, env=migration)
if runtime.get('DATABASE_URL', '').startswith(('postgres://', 'postgresql://')):
    subprocess.run([sys.executable, 'manage.py', 'check_rls'], check=True, env=runtime)
if runtime.get('SCHOOL_DEMO_ACCOUNTS'):
    subprocess.run([sys.executable, 'manage.py', 'bootstrap_school_demo'], check=True, env=runtime)
