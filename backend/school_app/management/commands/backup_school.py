from pathlib import Path
import sqlite3

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Make a consistent SQLite backup before a migration; never overwrite a backup.'

    def add_arguments(self, parser):
        parser.add_argument('--output', required=True)

    def handle(self, *args, **options):
        database = settings.DATABASES['default']
        if database['ENGINE'] != 'django.db.backends.sqlite3':
            raise CommandError('For PostgreSQL, take and verify a provider snapshot or pg_dump backup as documented in docs/MULTI_TENANCY.md.')
        source = Path(database['NAME']).resolve()
        destination = Path(options['output']).resolve()
        if not source.is_file() or source == destination or destination.exists():
            raise CommandError('Choose a new backup filename and an existing source database.')
        destination.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as src, sqlite3.connect(destination) as dest:
            src.backup(dest)
            if dest.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise CommandError('Backup integrity check failed. Do not migrate.')
        self.stdout.write(self.style.SUCCESS(f'Backup verified: {destination}'))
