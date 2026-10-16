from django.db import transaction
from django.db.models import Sum, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from .views import InputAPIView, identifier
from .permissions import SchoolAccess, SchoolAdmin, authorized_classes, is_admin, teacher_for
from .models import AttendanceSession, AttendanceRevision, Notification, Fee, FeePayment, Student, SchoolSettings
from .serializers import FeeSerializer, StudentSerializer
from .notifications import refresh_reminders
from .curriculum import subjects_for_grade, SOURCE


def attendance_session_data(session, request):
    if not session:
        return None
    config = SchoolSettings.objects.first()
    return {'id': session.pk, 'revision': session.revision, 'actor_name': session.actor_name,
            'actor_identifier': session.actor_identifier, 'actor_role': session.actor_role, 'saved_at': session.saved_at,
            'can_retake': is_admin(request) or not config or config.allow_teacher_attendance_retake,
            'history': list(session.history.order_by('-revision').values('revision', 'actor_name', 'actor_identifier', 'actor_role', 'saved_at', 'reason'))}


class AttendanceSessionView(InputAPIView):
    def get(self, request):
        school_class = get_object_or_404(authorized_classes(request), pk=identifier(request.query_params.get('school_class')))
        day = serializers.DateField().run_validation(request.query_params.get('date'))
        session = AttendanceSession.objects.filter(school_class=school_class, attendance_date=day).first()
        config = SchoolSettings.objects.first()
        return Response({'session': attendance_session_data(session, request), 'can_retake': is_admin(request) or not config or config.allow_teacher_attendance_retake})


class CurriculumView(InputAPIView):
    def get(self, request):
        return Response({'source': SOURCE, 'editable': True, 'grades': [{'grade': str(g), 'subjects': subjects_for_grade(g)} for g in range(1, 13)]})


class NotificationView(InputAPIView):
    def visible(self, request):
        qs = Notification.objects.filter(recipient=request.user)
        if not is_admin(request):
            qs = qs.filter(Q(school_class__in=authorized_classes(request)) | Q(school_class__isnull=True, section='announcements')).exclude(section__in=['fees', 'reports', 'settings'])
        return qs

    def get(self, request):
        refresh_reminders(request)
        qs = self.visible(request)
        return Response({'unread_count': qs.filter(read_at__isnull=True).count(), 'results': list(qs.order_by('-created_at', '-pk')[:40].values('id', 'title', 'message', 'section', 'school_class_id', 'read_at', 'created_at'))})

    def post(self, request):
        qs = self.visible(request)
        if not request.data.get('all'):
            qs = qs.filter(pk=identifier(request.data.get('id')))
            if not qs.exists():
                from rest_framework.exceptions import NotFound
                raise NotFound()
        qs.filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response({'detail': 'Notifications marked read.'})


class StudentStatementView(InputAPIView):
    permission_classes = [SchoolAdmin]

    def get(self, request, pk):
        student = get_object_or_404(Student.objects.select_related('school_class'), pk=pk)
        invoices = Fee.objects.filter(student=student, is_active=True).prefetch_related('payments').order_by('due_date', 'pk')
        return Response({'student': StudentSerializer(student, context={'request': request}).data,
                         'totals': invoices.aggregate(total_due=Sum('total_due'), paid=Sum('paid_amount'), balance=Sum('remaining_amount')),
                         'invoices': FeeSerializer(invoices, many=True, context={'request': request}).data})


class FinanceSummaryView(InputAPIView):
    permission_classes = [SchoolAdmin]

    def get(self, request):
        invoices = Fee.objects.filter(is_active=True)
        return Response({**invoices.aggregate(total_due=Sum('total_due'), paid=Sum('paid_amount'), balance=Sum('remaining_amount')),
                         'overdue': invoices.filter(due_date__lt=timezone.localdate(), remaining_amount__gt=0).count(),
                         'collected_today': FeePayment.objects.filter(payment_date=timezone.localdate()).aggregate(amount=Sum('amount'))['amount'] or 0})
