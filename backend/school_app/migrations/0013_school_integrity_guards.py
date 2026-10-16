"""Same-school FK/M2M guards even for bulk and raw writes (SQLite + PostgreSQL)."""
from django.db import migrations

MODELS = ['SchoolClass', 'Student', 'Teacher', 'Attendance', 'Exam', 'Result', 'Fee', 'FeePayment', 'Homework', 'Announcement', 'SchoolSettings', 'TimetableEntry', 'Guardian', 'Enrollment']


def guards(apps):
    result = []
    owned = {apps.get_model('school_app', name) for name in MODELS}
    for model in owned:
        clauses = []
        for field in model._meta.fields:
            if field.is_relation and field.related_model in owned:
                clauses.append(f'NEW."{field.column}" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "{field.related_model._meta.db_table}" p WHERE p.id = NEW."{field.column}" AND p.school_id = NEW.school_id)')
        result.append((model._meta.db_table, clauses, True))
    teacher = apps.get_model('school_app', 'Teacher')
    through = teacher._meta.get_field('assigned_classes').remote_field.through
    result.append((through._meta.db_table, ['NOT EXISTS (SELECT 1 FROM school_app_teacher t JOIN school_app_schoolclass c ON t.school_id = c.school_id WHERE t.id = NEW.teacher_id AND c.id = NEW.schoolclass_id)'], False))
    return result


def install(apps, schema_editor):
    vendor = schema_editor.connection.vendor
    for table, clauses, immutable in guards(apps):
        expression = ' OR '.join(f'({clause})' for clause in clauses) or 'FALSE'
        name = f'{table}_tenant_guard'
        if vendor == 'sqlite':
            for event in ['INSERT', 'UPDATE']:
                condition = expression
                if immutable and event == 'UPDATE':
                    condition += ' OR NEW.school_id <> OLD.school_id'
                schema_editor.execute(f'CREATE TRIGGER "{name}_{event.lower()}" BEFORE {event} ON "{table}" WHEN {condition} BEGIN SELECT RAISE(ABORT, \'School relationship or ownership violation\'); END')
        elif vendor == 'postgresql':
            ownership = "IF TG_OP = 'UPDATE' AND NEW.school_id <> OLD.school_id THEN RAISE EXCEPTION 'School ownership violation' USING ERRCODE = '23514'; END IF;" if immutable else ''
            schema_editor.execute(f"CREATE FUNCTION \"{name}\"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN {ownership} IF {expression} THEN RAISE EXCEPTION 'School relationship violation' USING ERRCODE = '23514'; END IF; RETURN NEW; END $$")
            schema_editor.execute(f'CREATE TRIGGER "{name}" BEFORE INSERT OR UPDATE ON "{table}" FOR EACH ROW EXECUTE FUNCTION "{name}"()')
        else:
            raise RuntimeError('School integrity guards require SQLite or PostgreSQL.')


def uninstall(apps, schema_editor):
    for table, _, _ in guards(apps):
        name = f'{table}_tenant_guard'
        if schema_editor.connection.vendor == 'sqlite':
            for event in ['insert', 'update']:
                schema_editor.execute(f'DROP TRIGGER IF EXISTS "{name}_{event}"')
        elif schema_editor.connection.vendor == 'postgresql':
            schema_editor.execute(f'DROP TRIGGER IF EXISTS "{name}" ON "{table}"')
            schema_editor.execute(f'DROP FUNCTION IF EXISTS "{name}"()')


class Migration(migrations.Migration):
    dependencies = [('school_app', '0012_alter_attendance_options_alter_enrollment_options_and_more')]
    operations = [migrations.RunPython(install, uninstall)]
