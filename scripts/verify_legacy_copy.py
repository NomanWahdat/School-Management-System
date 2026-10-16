"""Migrate a read-only snapshot into a separate temporary database and compare records."""
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import argparse

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--source', default=str(root / 'backend' / 'db.sqlite3'))
source = Path(parser.parse_args().source).resolve()
directory = root / 'backend' / '.verification'
directory.mkdir(parents=True, exist_ok=True)
handle, filename = tempfile.mkstemp(suffix='.sqlite3', prefix='legacy-copy-', dir=directory)
os.close(handle)
destination = Path(filename)
tables = ['user', 'schoolclass', 'student', 'teacher', 'teacher_assigned_classes', 'attendance', 'exam', 'result', 'fee', 'feepayment', 'homework', 'announcement', 'schoolsettings', 'timetableentry']

with sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True) as src, sqlite3.connect(destination) as dst:
    src.backup(dst)
    baseline = {}
    for name in tables:
        table = 'school_app_' + name
        columns = [row[1] for row in src.execute(f'PRAGMA table_info("{table}")')]
        rows = src.execute(f'SELECT * FROM "{table}" ORDER BY id').fetchall()
        baseline[table] = (columns, rows)

sys.path.insert(0, str(root / 'backend'))
os.environ['DJANGO_SETTINGS_MODULE'] = 'school_management.settings'
from django.conf import settings
settings.DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': str(destination)}}
import django
django.setup()
from django.core.management import call_command
call_command('migrate', verbosity=0)
call_command('validate_school_data', verbosity=0)
with sqlite3.connect(destination) as migrated:
    for table, (columns, original) in baseline.items():
        # Only historically NULL attendance/invoice class references may be filled.
        preserved = columns
        query = ','.join('"' + column + '"' for column in preserved)
        expected = [tuple(row[columns.index(column)] for column in preserved) for row in original]
        if table in ('school_app_attendance', 'school_app_fee') and 'school_class_id' in columns:
            student_columns, student_rows = baseline['school_app_student']
            classes = {row[student_columns.index('id')]: row[student_columns.index('school_class_id')] for row in student_rows}
            expected = [tuple(classes[row[columns.index('student_id')]] if column == 'school_class_id' and row[columns.index(column)] is None else row[columns.index(column)] for column in preserved) for row in original]
        actual = migrated.execute(f'SELECT {query} FROM "{table}" ORDER BY id').fetchall()
        if actual != expected:
            raise RuntimeError(f'Legacy values changed in {table}; do not migrate the real database.')
        print(f'{table}: {len(original)} records; original values and IDs preserved')
    assert migrated.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
print('Representative migration passed. The original database was opened read-only and was not changed.')
