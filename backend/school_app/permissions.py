from rest_framework.permissions import BasePermission
from rest_framework.exceptions import PermissionDenied

from .models import Membership, Teacher
from .tenancy import establish_school


class SchoolAccess(BasePermission):
    message = 'An active school membership is required.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.must_change_password:
            raise PermissionDenied('Change your temporary password before continuing.')
        token = request.auth
        selected = token.get('school_id') if token is not None and hasattr(token, 'get') else None
        if not selected:
            raise PermissionDenied('Choose an authorized school workspace first.')
        membership = Membership.objects.select_related('school').filter(
            user=request.user, school_id=selected, is_active=True, school__is_active=True,
        ).first()
        if not membership or token.get('membership_version') != membership.version:
            raise PermissionDenied('School access has changed. Sign in or select a school again.')
        expected = request.headers.get('X-School-ID')
        if expected is not None and str(expected) != str(selected):
            from rest_framework.exceptions import APIException
            exc = APIException('The school changed. Reopen this form in the active school.')
            exc.status_code = 409
            raise exc
        request.school = membership.school
        request.membership = membership
        establish_school(selected)
        if request.user.is_superuser:
            from .models import AuditEvent
            AuditEvent.objects.create(actor=request.user, school=membership.school, action='platform_school_request', target=f'{request.method}:{request.path}'[:120])
        if membership.role == 'teacher' and not Teacher.objects.filter(user=request.user, status='Active').exists():
            raise PermissionDenied('Your teacher profile is inactive. Contact your school administrator.')
        return True


class SchoolAdmin(SchoolAccess):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.membership.role == 'admin'


class PlatformAdmin(BasePermission):
    message = 'Platform administrator access is required.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_active
                    and request.user.is_superuser and not request.user.must_change_password)


def is_admin(request):
    return getattr(request, 'membership', None) is not None and request.membership.role == 'admin'


def teacher_for(request):
    return Teacher.objects.filter(user=request.user, status='Active').first()


def authorized_classes(request):
    from .models import SchoolClass
    if is_admin(request):
        return SchoolClass.objects.all()
    teacher = teacher_for(request)
    return teacher.assigned_classes.all() if teacher else SchoolClass.objects.none()


def authorized_subjects(request, class_id):
    teacher = teacher_for(request)
    if not teacher or not teacher.assigned_classes.filter(pk=class_id).exists():
        return set()
    from .models import TimetableEntry
    return {teacher.subject, *TimetableEntry.objects.filter(teacher=teacher, school_class_id=class_id).values_list('subject', flat=True)}
