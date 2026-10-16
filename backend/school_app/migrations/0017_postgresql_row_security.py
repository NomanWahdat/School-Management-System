"""RLS is enforced by a non-owner runtime role and transaction-local school context."""
from django.db import migrations

NAMES = ['SchoolClass', 'Student', 'Teacher', 'Attendance', 'Exam', 'Result', 'Fee', 'FeePayment', 'Homework', 'Announcement', 'SchoolSettings', 'TimetableEntry', 'Guardian', 'Enrollment', 'AttendanceSession', 'AttendanceRevision', 'Notification']


def tables(apps):
    return [apps.get_model('school_app', name)._meta.db_table for name in NAMES]


def install(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    current = "NULLIF(current_setting('app.school_id', true), '')::bigint"
    policies = [(table, f'school_id = {current}') for table in tables(apps)]
    policies.append(('school_app_teacher_assigned_classes', f'EXISTS (SELECT 1 FROM school_app_teacher t WHERE t.id = school_app_teacher_assigned_classes.teacher_id AND t.school_id = {current})'))
    for table, expression in policies:
        schema_editor.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
        schema_editor.execute(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY')
        schema_editor.execute(f'CREATE POLICY school_isolation ON "{table}" FOR ALL USING ({expression}) WITH CHECK ({expression})')


def uninstall(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    for table in tables(apps) + ['school_app_teacher_assigned_classes']:
        schema_editor.execute(f'DROP POLICY IF EXISTS school_isolation ON "{table}"')
        schema_editor.execute(f'ALTER TABLE "{table}" NO FORCE ROW LEVEL SECURITY')
        schema_editor.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')


class Migration(migrations.Migration):
    dependencies = [('school_app', '0016_classroom_workflows')]
    operations = [migrations.RunPython(install, uninstall)]
