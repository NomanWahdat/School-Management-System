"""Verified request/job school context. Never infer authority from an identifier."""
from contextlib import contextmanager, nullcontext
from contextvars import ContextVar

from django.db import models, transaction, connection
from rest_framework.exceptions import PermissionDenied

_school = ContextVar('verified_school', default=None)


def school_id():
    value = _school.get()
    if value is None:
        raise PermissionDenied('Choose an authorized school workspace first.')
    return value


def establish_school(value):
    from .rls import bind_school
    bind_school(value)
    return _school.set(int(value))


@contextmanager
def school_context(value):
    """Internal jobs must authorize their actor before entering this context."""
    previous = _school.get()
    token = _school.set(int(value) if value is not None else None)
    try:
        from .rls import bind_school
        with transaction.atomic() if connection.vendor == 'postgresql' else nullcontext():
            bind_school(value)
            try:
                yield
            finally:
                if not connection.needs_rollback:
                    bind_school(previous)
    finally:
        _school.reset(token)


class SchoolContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        with school_context(None):
            response = self.get_response(request)
            if request.path.startswith('/api/'):
                response['Cache-Control'] = 'private, no-store'
            return response


class SchoolQuerySet(models.QuerySet):
    def _clone(self):
        clone = super()._clone()
        clone.verified_school_id = getattr(self, 'verified_school_id', None)
        return clone

    def _check_context(self):
        if school_id() != getattr(self, 'verified_school_id', None):
            raise PermissionDenied('A school query cannot be reused in another school context.')

    def _fetch_all(self):
        self._check_context()
        return super()._fetch_all()

    def __getitem__(self, key):
        self._check_context()
        return super().__getitem__(key)

    def count(self):
        self._check_context()
        return super().count()

    def exists(self):
        self._check_context()
        return super().exists()

    def aggregate(self, *args, **kwargs):
        self._check_context()
        return super().aggregate(*args, **kwargs)

    def iterator(self, *args, **kwargs):
        self._check_context()
        for item in super().iterator(*args, **kwargs):
            self._check_context()
            yield item

    def update(self, **kwargs):
        self._check_context()
        if 'school' in kwargs or 'school_id' in kwargs:
            raise PermissionDenied('School ownership cannot be changed.')
        return super().update(**kwargs)

    def create(self, **kwargs):
        self._check_context()
        return super().create(**kwargs)

    def delete(self):
        self._check_context()
        return super().delete()

    def bulk_create(self, objs, **kwargs):
        self._check_context()
        for obj in objs:
            if obj.school_id not in (None, self.verified_school_id):
                raise PermissionDenied('Bulk records must belong to the verified school.')
            obj.school_id = self.verified_school_id
        return super().bulk_create(objs, **kwargs)

    def bulk_update(self, objs, fields, **kwargs):
        self._check_context()
        if 'school' in fields or any(obj.school_id != self.verified_school_id for obj in objs):
            raise PermissionDenied('Bulk records must belong to the verified school.')
        return super().bulk_update(objs, fields, **kwargs)


class SchoolManager(models.Manager.from_queryset(SchoolQuerySet)):
    def get_queryset(self):
        selected = school_id()
        queryset = super().get_queryset()
        queryset.verified_school_id = selected
        return queryset.filter(school_id=selected)


class SchoolOwned(models.Model):
    school = models.ForeignKey('School', on_delete=models.PROTECT)
    objects = SchoolManager()
    # Deliberately explicit escape hatch, only for trusted platform/migration tooling.
    all_objects = models.Manager()

    class Meta:
        abstract = True
        base_manager_name = 'all_objects'
        default_manager_name = 'objects'

    def save(self, *args, **kwargs):
        from django.core.exceptions import ValidationError
        if not self.school_id:
            self.school_id = school_id()
        active = _school.get()
        if active is not None and active != self.school_id:
            raise ValidationError('Record belongs to a different school context.')
        if self.pk:
            previous = type(self).all_objects.filter(pk=self.pk).values_list('school_id', flat=True).first()
            if previous and previous != self.school_id:
                raise ValidationError('School ownership cannot be changed.')
        for field in self._meta.fields:
            if field.is_relation and field.name != 'school' and field.related_model and issubclass(field.related_model, SchoolOwned):
                related_id = getattr(self, field.attname)
                if related_id and not field.related_model.all_objects.filter(pk=related_id, school_id=self.school_id).exists():
                    raise ValidationError({field.name: 'Related record must belong to the same school.'})
        super().save(*args, **kwargs)
