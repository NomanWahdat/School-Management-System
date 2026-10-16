"""Persisted in-app notifications; never send student details to outside services."""
from django.db.models import Q
from django.utils import timezone
from .models import Membership, Teacher, Notification, Fee, Exam, Announcement


def notify(school, event_key, title, message, section, school_class=None, exclude_user=None, admins_only=False):
    users = Membership.objects.filter(school=school, is_active=True, user__is_active=True)
    if admins_only or school_class is None:
        users = users.filter(role='admin')
    else:
        assigned = Teacher.objects.filter(assigned_classes=school_class, status='Active').values_list('user_id', flat=True)
        users = users.filter(Q(role='admin') | Q(role='teacher', user_id__in=assigned))
    for member in users.exclude(user_id=exclude_user).iterator():
        Notification.objects.get_or_create(recipient_id=member.user_id, event_key=event_key[:120], defaults={
            'school': school, 'title': title[:160], 'message': message[:400], 'section': section, 'school_class': school_class,
        })


def refresh_reminders(request):
    today = timezone.localdate()
    if request.membership.role == 'admin':
        count = Fee.objects.filter(is_active=True, due_date__lt=today, remaining_amount__gt=0).count()
        if count:
            Notification.objects.get_or_create(recipient=request.user, event_key=f'overdue:{today}', defaults={
                'school': request.school, 'title': 'Overdue fee follow-up', 'message': f'{count} unpaid invoices need follow-up.', 'section': 'fees',
            })
    classes = None
    if request.membership.role == 'teacher':
        teacher = Teacher.objects.filter(user=request.user, status='Active').first()
        classes = teacher.assigned_classes.all() if teacher else []
    exams = Exam.objects.filter(exam_date__gte=today, exam_date__lte=today + timezone.timedelta(days=7))
    if classes is not None:
        exams = exams.filter(school_class__in=classes)
    for exam in exams[:30]:
        Notification.objects.get_or_create(recipient=request.user, event_key=f'exam-reminder:{exam.pk}:{exam.exam_date}', defaults={
            'school': request.school, 'title': 'Upcoming examination', 'message': f'{exam.name} - {exam.exam_date}', 'section': 'exams', 'school_class': exam.school_class,
        })
    now = timezone.now()
    notices = Announcement.objects.filter(status='Published').filter(Q(publish_at__isnull=True) | Q(publish_at__lte=now)).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
    if classes is not None:
        notices = notices.filter(Q(audience__in=['Everyone', 'Teachers']) | Q(audience='Class', school_class__in=classes))
    for notice in notices.order_by('-created_at')[:20]:
        Notification.objects.get_or_create(recipient=request.user, event_key=f'announcement:{notice.pk}', defaults={
            'school': request.school, 'title': 'School announcement', 'message': notice.title[:400], 'section': 'announcements', 'school_class': notice.school_class,
        })
