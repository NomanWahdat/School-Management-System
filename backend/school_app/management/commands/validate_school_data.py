from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = 'Read-only ownership preflight for legacy and migrated school databases.'

    def handle(self, *args, **options):
        if connection.vendor == 'postgresql':
            with connection.cursor() as cursor:
                cursor.execute('SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user')
                if not cursor.fetchone()[0]:
                    raise CommandError('Global ownership validation requires a protected maintenance connection that can inspect all schools; the restricted runtime role intentionally cannot do this.')
        tables = set(connection.introspection.table_names())
        if 'school_app_student' not in tables:
            self.stdout.write('Fresh database: run migrations first.')
            return
        with connection.cursor() as cursor:
            issues = []
            # Migrated history can intentionally differ from current enrollment.
            columns = {c.name for c in connection.introspection.get_table_description(cursor, 'school_app_student')}
            migrated = 'school_id' in columns
            checks = [] if migrated else [
                ('attendance/student class mismatch', 'SELECT a.id FROM school_app_attendance a JOIN school_app_student s ON s.id=a.student_id WHERE a.school_class_id IS NOT NULL AND a.school_class_id<>s.school_class_id'),
                ('result/student exam class mismatch', 'SELECT r.id FROM school_app_result r JOIN school_app_student s ON s.id=r.student_id JOIN school_app_exam e ON e.id=r.exam_id WHERE s.school_class_id<>e.school_class_id'),
                ('fee/student class mismatch', 'SELECT f.id FROM school_app_fee f JOIN school_app_student s ON s.id=f.student_id WHERE f.school_class_id IS NOT NULL AND f.school_class_id<>s.school_class_id'),
                ('teacher account role mismatch', "SELECT t.id FROM school_app_teacher t JOIN school_app_user u ON u.id=t.user_id WHERE u.role<>'teacher'"),
            ]
            if migrated:
                from school_app.models import SchoolOwned
                from django.apps import apps
                for model in apps.get_app_config('school_app').get_models():
                    if not issubclass(model, SchoolOwned):
                        continue
                    table = model._meta.db_table
                    checks.append((f'{table} missing school', f'SELECT id FROM "{table}" WHERE school_id IS NULL'))
                    for field in model._meta.fields:
                        if field.is_relation and issubclass(field.related_model, SchoolOwned):
                            checks.append((f'{table}/{field.name} school mismatch', f'SELECT a.id FROM "{table}" a JOIN "{field.related_model._meta.db_table}" b ON a."{field.column}"=b.id WHERE a.school_id<>b.school_id'))
                checks.append(('teacher/class school mismatch', 'SELECT a.id FROM school_app_teacher_assigned_classes a JOIN school_app_teacher t ON a.teacher_id=t.id JOIN school_app_schoolclass c ON a.schoolclass_id=c.id WHERE t.school_id<>c.school_id'))
            else:
                cursor.execute('SELECT COUNT(*) FROM school_app_schoolsettings')
                if cursor.fetchone()[0] > 1:
                    issues.append('Multiple legacy school settings rows require review.')
            for label, sql in checks:
                cursor.execute(sql)
                ids = [row[0] for row in cursor.fetchall()]
                if ids:
                    issues.append(f'{label}: IDs {ids}')
            for table in sorted(t for t in tables if t.startswith('school_app_') and t not in ['school_app_user_user_permissions', 'school_app_user_groups']):
                cursor.execute(f'SELECT COUNT(*) FROM "{table}"')
                self.stdout.write(f'{table}: {cursor.fetchone()[0]} records')
            if issues:
                raise CommandError('\n'.join(issues))
        self.stdout.write(self.style.SUCCESS('Ownership validation passed. No records changed.'))
