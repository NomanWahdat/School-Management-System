from django.utils import timezone
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from .models import Attendance, AttendanceSession, AttendanceRevision, SchoolSettings
from .permissions import is_admin, teacher_for
from .notifications import notify


def conflict(message):
    error = APIException(message)
    error.status_code = 409
    raise error


def save_register(request, validated, expected_revision=None, reason=''):
    """Called under a school lock/transaction; keeps old revisions immutable."""
    class_ids = {row['school_class'].pk for row in validated}
    dates = {row['attendance_date'] for row in validated}
    if len(class_ids) != 1 or len(dates) != 1:
        raise ValidationError('Save one class and date at a time.')
    cls, day = validated[0]['school_class'], validated[0]['attendance_date']
    if expected_revision is not None and {row['student'].pk for row in validated} != set(cls.students.filter(is_active=True).values_list('pk', flat=True)):
        raise ValidationError('The class roster changed. Reload and mark every active student before saving.')
    session = AttendanceSession.objects.filter(school_class=cls, attendance_date=day).first()
    revision = session.revision if session else 0
    if expected_revision is not None and (type(expected_revision) is not int or expected_revision != revision):
        conflict('Attendance changed since you opened it. Reload the register before retaking.')
    existing = Attendance.objects.filter(school_class=cls, attendance_date=day)
    config = SchoolSettings.objects.first()
    if existing.exists() and not is_admin(request) and config and not config.allow_teacher_attendance_retake:
        raise PermissionDenied('Teacher retakes are disabled. Ask the school administrator to correct this register.')
    snapshot = sorted([{'student': row['student'].pk, 'status': row['status'], 'remarks': row.get('remarks') or ''} for row in validated], key=lambda row: row['student'])
    previous = list(existing.order_by('student_id').values('student', 'status', 'remarks'))
    previous = [{**row, 'remarks': row['remarks'] or ''} for row in previous]
    if session and snapshot == previous and not reason:
        return list(existing), session
    if session and expected_revision is not None and not reason.strip():
        raise ValidationError('Enter a short reason for retaking attendance.')
    teacher = teacher_for(request) if not is_admin(request) else None
    actor = {'actor_name': teacher.name if teacher else request.user.get_full_name() or request.user.username,
             'actor_identifier': teacher.teacher_id if teacher else request.user.username, 'actor_role': request.membership.role}
    rows = []
    for data in validated:
        obj, _ = Attendance.objects.update_or_create(student=data['student'], school_class=cls, attendance_date=day,
            defaults={'school': request.school, 'status': data['status'], 'remarks': data.get('remarks', ''), 'recorded_by': request.user})
        rows.append(obj)
    complete = list(Attendance.objects.filter(school_class=cls, attendance_date=day).order_by('student_id').values('student', 'status', 'remarks'))
    session, _ = AttendanceSession.objects.update_or_create(school_class=cls, attendance_date=day,
        defaults={'school': request.school, 'revision': revision + 1, 'taken_by': request.user, 'saved_at': timezone.now(), **actor})
    AttendanceRevision.objects.create(session=session, revision=session.revision, records=complete, reason=reason[:255], **actor)
    notify(request.school, f'attendance:{session.pk}:{session.revision}', 'Attendance saved',
           f'{cls.name}: {actor["actor_name"]} ({actor["actor_identifier"]}) saved attendance for {day}.', 'attendance', cls, request.user.pk)
    return rows, session
