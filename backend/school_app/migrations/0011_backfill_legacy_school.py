"""Preserve legacy records, but stop on ambiguous relationships rather than guessing."""
from django.db import migrations
from django.db.models import F

OWNED = ['SchoolClass', 'Student', 'Teacher', 'Attendance', 'Exam', 'Result', 'Fee', 'FeePayment', 'Homework', 'Announcement', 'SchoolSettings', 'TimetableEntry']


def forwards(apps, schema_editor):
    alias = schema_editor.connection.alias
    model = lambda name: apps.get_model('school_app', name)
    issues = []
    def report(label, qs):
        ids = list(qs.values_list('pk', flat=True))
        if ids:
            issues.append(f'{label}: record IDs {ids}')
    if model('SchoolSettings').objects.using(alias).count() > 1:
        issues.append('Multiple legacy school settings rows: choose the correct branding before migration.')
    report('Attendance student/class mismatch', model('Attendance').objects.using(alias).exclude(school_class_id=None).exclude(school_class_id=F('student__school_class_id')))
    report('Result student/exam class mismatch', model('Result').objects.using(alias).exclude(student__school_class_id=F('exam__school_class_id')))
    report('Fee student/class mismatch', model('Fee').objects.using(alias).exclude(school_class_id=None).exclude(school_class_id=F('student__school_class_id')))
    report('Teacher account has incompatible legacy role', model('Teacher').objects.using(alias).filter(user__isnull=False).exclude(user__role='teacher'))
    report('Unknown legacy user role', model('User').objects.using(alias).exclude(role__in=['admin', 'teacher']))
    if issues:
        raise RuntimeError('Legacy school migration stopped. No records were reassigned.\n' + '\n'.join(issues))
    if not any(model(name).objects.using(alias).exists() for name in OWNED) and not model('User').objects.using(alias).exists():
        return
    config = model('SchoolSettings').objects.using(alias).first()
    school = model('School').objects.using(alias).create(name=config.school_name if config else 'My School', slug='existing-school', logo=config.logo.name if config and config.logo else '')
    for name in OWNED:
        model(name).objects.using(alias).filter(school_id=None).update(school_id=school.pk)
    for row in model('Attendance').objects.using(alias).filter(school_class_id=None).select_related('student'):
        row.school_class_id = row.student.school_class_id
        row.save(using=alias, update_fields=['school_class'])
    for row in model('Fee').objects.using(alias).filter(school_class_id=None).select_related('student'):
        row.school_class_id = row.student.school_class_id
        row.save(using=alias, update_fields=['school_class'])
    for user in model('User').objects.using(alias).all():
        model('Membership').objects.using(alias).create(user_id=user.pk, school_id=school.pk, role=user.role, is_active=user.is_active)
    year = config.academic_year if config else '2026'
    for student in model('Student').objects.using(alias).select_related('school_class'):
        model('Enrollment').objects.using(alias).create(school_id=school.pk, student_id=student.pk, school_class_id=student.school_class_id, academic_year=student.school_class.academic_year or year, enrolled_at=student.admission_date)
    if config:
        config.teaching_days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']
        config.grading_scale = {'A': 90, 'B': 80, 'C': 70, 'D': 60, 'E': 0}
        config.save(using=alias, update_fields=['teaching_days', 'grading_scale'])
    else:
        model('SchoolSettings').objects.using(alias).create(school_id=school.pk, school_name=school.name)
    model('AuditEvent').objects.using(alias).create(school_id=school.pk, action='legacy_school_migrated', target='existing-records-preserved')


def backwards(apps, schema_editor):
    # Unscoping for a schema rollback does not delete any academic/financial data.
    for name in OWNED:
        apps.get_model('school_app', name).objects.using(schema_editor.connection.alias).update(school_id=None)


class Migration(migrations.Migration):
    dependencies = [('school_app', '0010_school_alter_announcement_options_alter_exam_options_and_more')]
    operations = [migrations.RunPython(forwards, backwards)]
