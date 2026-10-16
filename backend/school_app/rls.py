"""Transaction-local PostgreSQL tenant binding, safe for PgBouncer transaction pooling."""
from django.db import connection


def bind_school(value):
    if connection.vendor != 'postgresql':
        return
    if not connection.in_atomic_block:
        raise RuntimeError('PostgreSQL school context requires a transaction.')
    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config('app.school_id', %s, true)", [str(value) if value is not None else ''])
