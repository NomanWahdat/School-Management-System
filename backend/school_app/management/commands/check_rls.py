"""Read-only deployment gate; refuses roles that can bypass school policies."""
from importlib import import_module
from django.core.management.base import BaseCommand, CommandError
from django.db import connection


def verify_rls():
    if connection.vendor != 'postgresql':
        raise CommandError('RLS verification requires PostgreSQL; SQLite uses application scope and relationship triggers.')
    from django.apps import apps
    tables = import_module('school_app.migrations.0017_postgresql_row_security').tables(apps) + ['school_app_teacher_assigned_classes']
    with connection.cursor() as cursor:
        cursor.execute('SELECT current_user, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname=current_user')
        name, superuser, bypass, create_role, create_db = cursor.fetchone()
        if superuser or bypass or create_role or create_db:
            raise CommandError('The runtime role has excessive PostgreSQL privileges. Configure a restricted Render DATABASE_URL.')
        cursor.execute("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_has_role(current_user,c.relowner,'MEMBER'),(SELECT COUNT(*) FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='school_isolation') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(%s)", [tables])
        rows = cursor.fetchall()
        invalid = [r[0] for r in rows if not r[1] or not r[2] or r[3] or r[4] != 1]
        if len(rows) != len(tables) or invalid:
            raise CommandError('Missing/unsafe RLS policies or runtime ownership. Run migrations with the separate owner connection and provision the runtime role. Tables: ' + ', '.join(invalid))
    return name, len(tables)


class Command(BaseCommand):
    help = 'Verify PostgreSQL RLS policies and the actual non-owner runtime role without changing school records.'

    def handle(self, *args, **options):
        name, count = verify_rls()
        self.stdout.write(self.style.SUCCESS(f'RLS verified: {count} protected tables; runtime role {name} is neither owner, superuser nor BYPASSRLS.'))
