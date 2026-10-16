"""Migration helpers for tables added after the initial integrity guards."""
from importlib import import_module

EXTRA = ['AttendanceSession', 'AttendanceRevision', 'Notification']


def remove_original(apps, schema_editor):
    import_module('school_app.migrations.0013_school_integrity_guards').uninstall(apps, schema_editor)


def install_original(apps, schema_editor):
    import_module('school_app.migrations.0013_school_integrity_guards').install(apps, schema_editor)


def install_all(apps, schema_editor):
    base = import_module('school_app.migrations.0013_school_integrity_guards')
    base.install(apps, schema_editor)
    for name in EXTRA:
        model = apps.get_model('school_app', name)
        table = model._meta.db_table
        checks = []
        for field in model._meta.fields:
            related = field.related_model if field.is_relation else None
            if related and field.name != 'school' and any(f.name == 'school' for f in related._meta.fields) and related._meta.model_name != 'membership':
                checks.append(f'(NEW."{field.column}" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "{related._meta.db_table}" p WHERE p.id=NEW."{field.column}" AND p.school_id=NEW.school_id))')
        condition = ' OR '.join(checks) or 'FALSE'
        trigger = table + '_tenant_guard'
        if schema_editor.connection.vendor == 'sqlite':
            for event in ('INSERT', 'UPDATE'):
                expr = condition + (' OR NEW.school_id <> OLD.school_id' if event == 'UPDATE' else '')
                schema_editor.execute(f'CREATE TRIGGER "{trigger}_{event.lower()}" BEFORE {event} ON "{table}" WHEN {expr} BEGIN SELECT RAISE(ABORT, \'School relationship or ownership violation\'); END')
        elif schema_editor.connection.vendor == 'postgresql':
            schema_editor.execute(f"CREATE FUNCTION \"{trigger}\"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP='UPDATE' AND NEW.school_id<>OLD.school_id THEN RAISE EXCEPTION 'School ownership violation' USING ERRCODE='23514'; END IF; IF {condition} THEN RAISE EXCEPTION 'School relationship violation' USING ERRCODE='23514'; END IF; RETURN NEW; END $$")
            schema_editor.execute(f'CREATE TRIGGER "{trigger}" BEFORE INSERT OR UPDATE ON "{table}" FOR EACH ROW EXECUTE FUNCTION "{trigger}"()')


def remove_all(apps, schema_editor):
    remove_original(apps, schema_editor)
    for name in EXTRA:
        table = apps.get_model('school_app', name)._meta.db_table
        trigger = table + '_tenant_guard'
        if schema_editor.connection.vendor == 'sqlite':
            for event in ('insert', 'update'):
                schema_editor.execute(f'DROP TRIGGER IF EXISTS "{trigger}_{event}"')
        elif schema_editor.connection.vendor == 'postgresql':
            schema_editor.execute(f'DROP TRIGGER IF EXISTS "{trigger}" ON "{table}"')
            schema_editor.execute(f'DROP FUNCTION IF EXISTS "{trigger}"()')
