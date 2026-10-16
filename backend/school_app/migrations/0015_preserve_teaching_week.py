from django.db import migrations


def preserve_week(apps, schema_editor):
    config_model = apps.get_model('school_app', 'SchoolSettings')
    timetable = apps.get_model('school_app', 'TimetableEntry')
    audit = apps.get_model('school_app', 'AuditEvent')
    ordered = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    alias = schema_editor.connection.alias
    for config in config_model.objects.using(alias).select_related('school'):
        existing_days = set(timetable.objects.using(alias).filter(school_id=config.school_id).values_list('day', flat=True))
        if config.school.slug == 'existing-school' and existing_days:
            days = [day for day in ordered if day in existing_days]
            config.teaching_days = days
            config.save(using=alias, update_fields=['teaching_days'])
            audit.objects.using(alias).create(school_id=config.school_id, action='legacy_teaching_week_preserved', target='existing-timetable-days')


class Migration(migrations.Migration):
    dependencies = [('school_app', '0014_loginthrottle')]
    operations = [migrations.RunPython(preserve_week, migrations.RunPython.noop)]
