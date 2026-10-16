"""Run all backend tests using an isolated in-memory database, regardless of DATABASE_URL."""
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
os.environ['DJANGO_SETTINGS_MODULE'] = 'school_management.settings'
from django.conf import settings
settings.DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
settings.PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
settings.ALLOWED_HOSTS = ['testserver']
import django
django.setup()
from django.test.runner import DiscoverRunner
sys.exit(bool(DiscoverRunner(verbosity=1).run_tests(['school_app'])))
