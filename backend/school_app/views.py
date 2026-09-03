from datetime import date, datetime, timedelta

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.core.exceptions import ValidationError
from django.db.models import Q, Sum
from django.core.cache import cache
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Announcement, Attendance, Exam, Fee, FeePayment, Homework, Result, SchoolClass, SchoolSettings, Student, Teacher, TimetableEntry, User
from .serializers import (
    AnnouncementSerializer,
    AttendanceSerializer,
    ExamSerializer,
    FeePaymentSerializer,
    FeeSerializer,
    HomeworkSerializer,
    ResultSerializer,
    SchoolClassSerializer,
    StudentSerializer,
    TeacherSerializer,
    TimetableEntrySerializer,
    UserSerializer,
    SchoolSettingsSerializer,
)


def is_admin(user):
    return getattr(user, 'role', None) == 'admin'


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        client_ip = request.META.get('REMOTE_ADDR', 'unknown')
        attempts_key = f'login-attempts:{client_ip}'
        attempts = cache.get(attempts_key, 0)
        if attempts >= 5:
            return Response({'detail': 'Too many login attempts. Please try again in 15 minutes.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        username = request.data.get('username')
        password = request.data.get('password')
        user = authenticate(username=username, password=password)
        if user is None or not user.is_active:
            cache.set(attempts_key, attempts + 1, timeout=900)
            if user is not None and not user.is_active:
                return Response({'detail': 'This account is inactive. Contact the school administrator.'}, status=status.HTTP_403_FORBIDDEN)
            return Response({'detail': 'Invalid username or password.'}, status=status.HTTP_401_UNAUTHORIZED)

        cache.delete(attempts_key)

        refresh = RefreshToken.for_user(user)
        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': UserSerializer(user).data,
        })


class ForgotPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # No email delivery service is configured, so avoid account enumeration and direct users to the administrator.
        return Response({'detail': 'If the account exists, contact the school administrator for a password reset.'})


class PublicSchoolBrandingView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        settings, _ = SchoolSettings.objects.get_or_create(pk=1)
        return Response({'school_name': settings.school_name, 'logo': request.build_absolute_uri(settings.logo.url) if settings.logo else None})


class DashboardSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if getattr(request.user, 'role', None) != 'admin':
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

        student_count = Student.objects.filter(is_active=True).count()
        teacher_count = Teacher.objects.filter(status='Active').count()
        announcement_count = Announcement.objects.count()
        today = date.today()
        today_records = Attendance.objects.filter(attendance_date=today).select_related('school_class', 'student')
        present_count = today_records.filter(status='Present').count()
        absent_count = today_records.filter(status='Absent').count()
        late_count = today_records.filter(status='Late').count()
        pending_fees = Student.objects.filter(fee_status='Pending').count()

        by_class = []
        for school_class in SchoolClass.objects.all().order_by('id'):
            class_records = today_records.filter(school_class=school_class)
            class_summary = {
                'class_id': school_class.id,
                'class_name': school_class.name,
                'present': class_records.filter(status='Present').count(),
                'absent': class_records.filter(status='Absent').count(),
                'late': class_records.filter(status='Late').count(),
                'total': class_records.count(),
            }
            by_class.append(class_summary)

        return Response({
            'student_count': student_count,
            'teacher_count': teacher_count,
            'pending_fees': pending_fees,
            'today_attendance': {
                'present': present_count,
                'absent': absent_count,
                'late': late_count,
                'total': today_records.count(),
                'by_class': by_class,
            },
            'announcement_count': announcement_count,
            'latest_announcements': AnnouncementSerializer(Announcement.objects.order_by('-created_at')[:3], many=True).data,
        })


class ReportsSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        report = request.query_params.get('report', 'summary')
        class_id = request.query_params.get('class')
        student_id = request.query_params.get('student')
        if report == 'students':
            queryset = Student.objects.select_related('school_class').all().order_by('school_class__name', 'name')
            if class_id:
                queryset = queryset.filter(school_class_id=class_id)
            if request.query_params.get('gender'):
                queryset = queryset.filter(gender=request.query_params['gender'])
            if request.query_params.get('status') == 'Active':
                queryset = queryset.filter(is_active=True)
            elif request.query_params.get('status') == 'Inactive':
                queryset = queryset.filter(is_active=False)
            return Response([{'student_id': item.student_id, 'name': item.name, 'father_name': item.father_name, 'class_name': item.school_class.name, 'contact_number': item.contact_number, 'gender': item.gender, 'status': 'Active' if item.is_active else 'Inactive'} for item in queryset])
        if report == 'attendance':
            queryset = Attendance.objects.select_related('student', 'school_class').all()
            if class_id:
                queryset = queryset.filter(school_class_id=class_id)
            if student_id:
                queryset = queryset.filter(student_id=student_id)
            if request.query_params.get('from'):
                queryset = queryset.filter(attendance_date__gte=request.query_params['from'])
            if request.query_params.get('to'):
                queryset = queryset.filter(attendance_date__lte=request.query_params['to'])
            if request.query_params.get('status'):
                queryset = queryset.filter(status=request.query_params['status'])
            return Response([{'date': item.attendance_date, 'student_id': item.student.student_id, 'student_name': item.student.name, 'class_name': item.school_class.name if item.school_class else '', 'status': item.status} for item in queryset.order_by('-attendance_date', 'student__name')])
        if report == 'results':
            queryset = Result.objects.select_related('student', 'exam', 'exam__school_class').all()
            if class_id:
                queryset = queryset.filter(exam__school_class_id=class_id)
            if request.query_params.get('exam'):
                queryset = queryset.filter(exam_id=request.query_params['exam'])
            if request.query_params.get('subject'):
                queryset = queryset.filter(subject=request.query_params['subject'])
            return Response([{'student_id': item.student.student_id, 'student_name': item.student.name, 'exam_name': item.exam.name, 'class_name': item.exam.school_class.name, 'subject': item.subject, 'marks': item.marks, 'maximum': item.total_marks, 'percentage': item.percentage, 'grade': item.grade} for item in queryset.order_by('exam__name', 'student__name')])
        if report == 'fees':
            queryset = Fee.objects.select_related('student', 'school_class').all().order_by('-created_at')
            if class_id:
                queryset = queryset.filter(school_class_id=class_id)
            if student_id:
                queryset = queryset.filter(student_id=student_id)
            if request.query_params.get('status'):
                queryset = queryset.filter(status=request.query_params['status'])
            return Response([{'student_id': item.student.student_id, 'student_name': item.student.name, 'class_name': item.school_class.name if item.school_class else item.student.school_class.name, 'fee_type': item.fee_type, 'total_due': float(item.total_due or item.amount or 0), 'paid': float(item.paid_amount or 0), 'remaining': float(item.remaining_amount or 0), 'due_date': item.due_date, 'status': item.status} for item in queryset])
        if report == 'teachers':
            return Response([{'name': item.name, 'subject': item.subject, 'classes': list(item.assigned_classes.values_list('name', flat=True)), 'class_count': item.assigned_classes.count(), 'status': item.status} for item in Teacher.objects.prefetch_related('assigned_classes').order_by('name')])
        student_count = Student.objects.filter(is_active=True).count()
        teacher_count = Teacher.objects.filter(status='Active').count()

        total_attendance_records = Attendance.objects.count()
        present_records = Attendance.objects.filter(status='Present').count()
        attendance_rate = round((present_records / total_attendance_records) * 100, 2) if total_attendance_records else 0

        fee_summary = {
            'paid': float(Fee.objects.aggregate(total=Sum('paid_amount'))['total'] or 0),
            'pending': float(Fee.objects.aggregate(total=Sum('remaining_amount'))['total'] or 0),
            'partially_paid': float(Fee.objects.filter(status='Partially Paid').aggregate(total=Sum('paid_amount'))['total'] or 0),
        }

        class_summary = [
            {
                'name': school_class.name,
                'student_count': school_class.students.filter(is_active=True).count(),
            }
            for school_class in SchoolClass.objects.all().order_by('id')
        ]

        return Response({
            'student_count': student_count,
            'teacher_count': teacher_count,
            'class_count': SchoolClass.objects.filter(status='Active').count(),
            'attendance_rate': attendance_rate,
            'fee_summary': fee_summary,
            'class_summary': class_summary,
            'result_count': Result.objects.count(),
        })


class TeacherDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if getattr(request.user, 'role', None) != 'teacher':
            return Response({'detail': 'Teacher access required.'}, status=status.HTTP_403_FORBIDDEN)

        teacher = Teacher.objects.filter(user=request.user).first()
        if not teacher:
            return Response({'detail': 'Teacher profile not found'}, status=status.HTTP_404_NOT_FOUND)

        assigned_classes = teacher.assigned_classes.all().order_by('id')
        assigned_class_ids = list(assigned_classes.values_list('id', flat=True))
        assigned_students = Student.objects.filter(school_class__in=assigned_classes, is_active=True).select_related('school_class')
        student_count = assigned_students.count()
        homework = Homework.objects.filter(school_class__in=assigned_classes).order_by('-created_at')[:5]

        today = date.today()
        recent_window_start = today - timedelta(days=7)
        attendance_records = Attendance.objects.filter(
            student__school_class__in=assigned_classes,
            attendance_date__gte=recent_window_start,
        )
        today_records = attendance_records.filter(attendance_date=today)
        today_timetable = list(
            TimetableEntry.objects.filter(
                day=today.strftime('%A'),
                teacher=teacher,
                school_class__in=assigned_classes,
            )
            .select_related('school_class', 'teacher')
            .order_by('start_time')
            .values('id', 'day', 'subject', 'start_time', 'end_time', 'school_class_id', 'school_class__name', 'teacher_id', 'teacher__name')
        )

        formatted_timetable = [
            {
                'id': item['id'],
                'day': item['day'],
                'subject': item['subject'],
                'start_time': str(item['start_time']),
                'end_time': str(item['end_time']),
                'school_class': item['school_class__name'],
                'school_class_id': item['school_class_id'],
                'teacher': item['teacher__name'],
            }
            for item in today_timetable
        ]

        assigned_subjects = list(dict.fromkeys([teacher.subject] + list(TimetableEntry.objects.filter(teacher=teacher).values_list('subject', flat=True))))
        class_data = []
        for school_class in assigned_classes:
            class_students = assigned_students.filter(school_class=school_class)
            class_attendance = today_records.filter(school_class=school_class)
            class_data.append({
                'id': school_class.id,
                'name': school_class.name,
                'grade': school_class.grade,
                'academic_year': school_class.academic_year,
                'student_count': class_students.count(),
                'subjects': school_class.subjects or [],
                'attendance_marked': class_attendance.count(),
                'attendance_total': class_students.count(),
            })
        upcoming_exams = Exam.objects.filter(school_class__in=assigned_classes, exam_date__gte=today).order_by('exam_date', 'id')[:5]
        pending_results = []
        for exam in upcoming_exams:
            exam_subjects = exam.subjects or [exam.subject]
            for subject in exam_subjects:
                student_total = assigned_students.filter(school_class_id=exam.school_class_id).count()
                completed = Result.objects.filter(exam=exam, subject=subject, student__school_class_id=exam.school_class_id).count()
                if completed < student_total:
                    pending_results.append({
                        'exam_id': exam.id, 'exam_name': exam.name, 'class_name': exam.school_class.name,
                        'subject': subject, 'completed': completed, 'total': student_total,
                    })
        relevant_announcements = Announcement.objects.filter(
            Q(status='Published') & (Q(publish_at__isnull=True) | Q(publish_at__lte=timezone.now())) &
            (Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())) &
            (Q(audience__in=['Everyone', 'Teachers']) | Q(audience='Class', school_class_id__in=assigned_class_ids))
        ).order_by('-created_at')[:5]

        return Response({
            'teacher_name': teacher.name,
            'subject': teacher.subject,
            'assigned_classes': [school_class.name for school_class in assigned_classes],
            'assigned_class_ids': assigned_class_ids,
            'assigned_classes_detail': class_data,
            'assigned_subjects': assigned_subjects,
            'student_count': student_count,
            'attendance_summary': {
                'marked_today': today_records.count(),
                'present': today_records.filter(status='Present').count(),
                'absent': today_records.filter(status='Absent').count(),
                'late': today_records.filter(status='Late').count(),
                'total_students': student_count,
                'attendance_percentage': round((today_records.filter(status='Present').count() / student_count) * 100, 2) if student_count else 0,
            },
            'pending_result_count': len(pending_results),
            'pending_results': pending_results,
            'upcoming_exams': [{'id': item.id, 'name': item.name, 'class_name': item.school_class.name, 'exam_date': item.exam_date, 'subjects': item.subjects or [item.subject]} for item in upcoming_exams],
            'today_timetable': formatted_timetable,
            'upcoming_homework': [
                {
                    'title': item.title,
                    'subject': item.subject,
                    'due_date': item.due_date,
                    'school_class': item.school_class.name,
                }
                for item in homework
            ],
            'relevant_announcements': AnnouncementSerializer(relevant_announcements, many=True).data,
        })


class StudentListCreateView(generics.ListCreateAPIView):
    queryset = Student.objects.all().order_by('-id')
    serializer_class = StudentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) not in ['admin', 'teacher']:
            return Response({'detail': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        if getattr(self.request.user, 'role', None) == 'teacher':
            teacher = Teacher.objects.filter(user=self.request.user).first()
            return Student.objects.filter(school_class__in=teacher.assigned_classes.all(), is_active=True).order_by('-id') if teacher else Student.objects.none()
        if getattr(self.request.user, 'role', None) != 'admin':
            return Student.objects.none()
        return Student.objects.all().order_by('-id')

    def create(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) != 'admin':
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

        student_id = request.data.get('student_id')
        student_id = student_id.strip() if isinstance(student_id, str) else student_id
        if student_id and Student.objects.filter(student_id=student_id).exists():
            return Response({'detail': 'A student with this ID already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        return super().create(request, *args, **kwargs)


class StudentDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def retrieve(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) == 'teacher':
            teacher = Teacher.objects.filter(user=request.user).first()
            if not teacher or not self.get_queryset().filter(school_class__in=teacher.assigned_classes.all(), is_active=True).filter(pk=kwargs.get('pk')).exists():
                return Response({'detail': 'Teacher is not assigned to this student.'}, status=status.HTTP_403_FORBIDDEN)
        elif getattr(request.user, 'role', None) != 'admin':
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().retrieve(request, *args, **kwargs)

    def get_queryset(self):
        if getattr(self.request.user, 'role', None) == 'teacher':
            teacher = Teacher.objects.filter(user=self.request.user).first()
            return Student.objects.filter(school_class__in=teacher.assigned_classes.all(), is_active=True) if teacher else Student.objects.none()
        if getattr(self.request.user, 'role', None) != 'admin':
            return Student.objects.none()
        return Student.objects.all()

    def update(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) != 'admin':
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

        student_id = request.data.get('student_id')
        instance = self.get_object()
        student_id = student_id.strip() if isinstance(student_id, str) else student_id
        if student_id and Student.objects.filter(student_id=student_id).exclude(id=instance.id).exists():
            return Response({'detail': 'A student with this ID already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        return super().update(request, *args, **kwargs)

    def delete(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) != 'admin':
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().delete(request, *args, **kwargs)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save()


class TeacherListCreateView(generics.ListCreateAPIView):
    queryset = Teacher.objects.all().order_by('-id')
    serializer_class = TeacherSerializer
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) != 'admin':
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        if getattr(self.request.user, 'role', None) != 'admin':
            return Teacher.objects.none()
        return Teacher.objects.all().order_by('-id')

    def create(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) != 'admin':
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

        teacher_id = request.data.get('teacher_id')
        teacher_id = teacher_id.strip() if isinstance(teacher_id, str) else teacher_id
        if teacher_id and Teacher.objects.filter(teacher_id=teacher_id).exists():
            return Response({'detail': 'A teacher with this ID already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        return super().create(request, *args, **kwargs)


class TeacherDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Teacher.objects.all().order_by('-id')
    serializer_class = TeacherSerializer
    permission_classes = [permissions.IsAuthenticated]

    def retrieve(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) != 'admin':
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().retrieve(request, *args, **kwargs)

    def get_queryset(self):
        if getattr(self.request.user, 'role', None) != 'admin':
            return Teacher.objects.none()
        return Teacher.objects.all().order_by('-id')

    def update(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) != 'admin':
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

        teacher_id = request.data.get('teacher_id')
        instance = self.get_object()
        teacher_id = teacher_id.strip() if isinstance(teacher_id, str) else teacher_id
        if teacher_id and Teacher.objects.filter(teacher_id=teacher_id).exclude(id=instance.id).exists():
            return Response({'detail': 'A teacher with this ID already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        return super().update(request, *args, **kwargs)

    def delete(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) != 'admin':
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        instance = self.get_object()
        instance.status = 'Inactive'
        instance.save(update_fields=['status'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def perform_destroy(self, instance):
        instance.status = 'Inactive'
        instance.save(update_fields=['status'])


class TeacherAccountView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _teacher(self, request, pk):
        if not is_admin(request.user):
            return None, Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return Teacher.objects.select_related('user').filter(pk=pk).first(), None

    def get(self, request, pk):
        teacher, error = self._teacher(request, pk)
        if error:
            return error
        if not teacher:
            return Response({'detail': 'Teacher not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            'teacher': teacher.id,
            'username': teacher.user.username if teacher.user else '',
            'email': teacher.user.email if teacher.user else '',
            'status': 'Active' if teacher.user and teacher.user.is_active else 'Inactive' if teacher.user else 'Not created',
            'must_change_password': bool(teacher.user and teacher.user.must_change_password),
        })

    @transaction.atomic
    def post(self, request, pk):
        teacher, error = self._teacher(request, pk)
        if error:
            return error
        if not teacher:
            return Response({'detail': 'Teacher not found.'}, status=status.HTTP_404_NOT_FOUND)

        username = (request.data.get('username') or request.data.get('email') or '').strip()
        email = (request.data.get('email') or username).strip()
        temporary_password = request.data.get('temporary_password') or request.data.get('password') or ''
        if not username or not temporary_password:
            return Response({'detail': 'Username/email and temporary password are required.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=username).exclude(pk=teacher.user_id).exists():
            return Response({'detail': 'That username is already in use.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(temporary_password)
        except ValidationError as exc:
            return Response({'detail': exc.messages}, status=status.HTTP_400_BAD_REQUEST)

        user = teacher.user or User(role='teacher')
        user.username = username
        user.email = email
        user.role = 'teacher'
        user.is_active = request.data.get('status', 'Active') == 'Active'
        user.must_change_password = bool(request.data.get('must_change_password', True))
        user.set_password(temporary_password)
        user.save()
        teacher.user = user
        teacher.save(update_fields=['user'])
        return Response({
            'teacher': TeacherSerializer(teacher).data,
            'account': {'username': user.username, 'email': user.email, 'status': 'Active' if user.is_active else 'Inactive', 'must_change_password': user.must_change_password},
            'temporary_password': temporary_password,
        }, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def patch(self, request, pk):
        teacher, error = self._teacher(request, pk)
        if error:
            return error
        if not teacher or not teacher.user:
            return Response({'detail': 'Teacher account not found.'}, status=status.HTTP_404_NOT_FOUND)
        user = teacher.user
        username = request.data.get('username')
        email = request.data.get('email')
        if username:
            username = username.strip()
            if User.objects.filter(username=username).exclude(pk=user.pk).exists():
                return Response({'detail': 'That username is already in use.'}, status=status.HTTP_400_BAD_REQUEST)
            user.username = username
        if email is not None:
            user.email = email.strip()
        if 'status' in request.data:
            user.is_active = request.data['status'] == 'Active'
        if 'must_change_password' in request.data:
            user.must_change_password = bool(request.data['must_change_password'])
        user.save(update_fields=['username', 'email', 'is_active', 'must_change_password'])
        return self.get(request, pk)

    @transaction.atomic
    def put(self, request, pk):
        return self.patch(request, pk)


class TeacherAccountResetPasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        teacher = Teacher.objects.select_related('user').filter(pk=pk).first()
        if not teacher or not teacher.user:
            return Response({'detail': 'Teacher account not found.'}, status=status.HTTP_404_NOT_FOUND)
        temporary_password = (request.data.get('temporary_password') or '').strip()
        if not temporary_password:
            return Response({'detail': 'Temporary password is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(temporary_password, teacher.user)
        except ValidationError as exc:
            return Response({'detail': exc.messages}, status=status.HTTP_400_BAD_REQUEST)
        teacher.user.set_password(temporary_password)
        teacher.user.must_change_password = True
        teacher.user.save(update_fields=['password', 'must_change_password'])
        return Response({'username': teacher.user.username, 'temporary_password': temporary_password})


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        current_password = request.data.get('current_password') or ''
        new_password = request.data.get('new_password') or ''
        if not request.user.check_password(current_password):
            return Response({'detail': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(new_password, request.user)
        except ValidationError as exc:
            return Response({'detail': exc.messages}, status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(new_password)
        request.user.must_change_password = False
        request.user.save(update_fields=['password', 'must_change_password'])
        return Response({'detail': 'Password changed successfully.'})


class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class LogoutAllView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        request.user.last_logout_at = timezone.now()
        request.user.save(update_fields=['last_logout_at'])
        return Response({'detail': 'All active sessions have been signed out.'})


class ClassListCreateView(generics.ListCreateAPIView):
    queryset = SchoolClass.objects.all().order_by('id')
    serializer_class = SchoolClassSerializer
    permission_classes = [permissions.IsAuthenticated]

    @staticmethod
    def _normalize_class_payload(data):
        name = (data.get('name') or '').strip()
        grade = (data.get('grade') or '').strip()
        academic_year = (data.get('academic_year') or '').strip()
        status_value = (data.get('status') or 'Active').strip()

        if not name:
            return None, {'detail': 'Class name is required.'}

        if not grade and name.lower().startswith('grade '):
            grade = name

        if not grade:
            grade = 'Unassigned'

        if not academic_year:
            academic_year = str(date.today().year)

        if status_value not in ['Active', 'Inactive']:
            return None, {'detail': 'Status is invalid.'}

        return {
            'name': name,
            'grade': grade,
            'academic_year': academic_year,
            'status': status_value,
        }, None

    def list(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) not in ['admin', 'teacher']:
            return Response({'detail': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        if getattr(self.request.user, 'role', None) == 'teacher':
            teacher = Teacher.objects.filter(user=self.request.user).first()
            return teacher.assigned_classes.all().order_by('id') if teacher else SchoolClass.objects.none()
        if getattr(self.request.user, 'role', None) != 'admin':
            return SchoolClass.objects.none()
        return SchoolClass.objects.all().order_by('id')

    def create(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) != 'admin':
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

        payload, error = self._normalize_class_payload(request.data)
        if error:
            return Response(error, status=status.HTTP_400_BAD_REQUEST)
        if SchoolClass.objects.filter(name=payload['name'], grade=payload['grade'], academic_year=payload['academic_year']).exists():
            return Response({'detail': 'A class with this name, grade, and academic year already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class ClassDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = SchoolClass.objects.all().order_by('id')
    serializer_class = SchoolClassSerializer
    permission_classes = [permissions.IsAuthenticated]

    def retrieve(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) not in ['admin', 'teacher']:
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().retrieve(request, *args, **kwargs)

    def get_queryset(self):
        if getattr(self.request.user, 'role', None) == 'teacher':
            teacher = Teacher.objects.filter(user=self.request.user).first()
            return teacher.assigned_classes.all() if teacher else SchoolClass.objects.none()
        if getattr(self.request.user, 'role', None) != 'admin':
            return SchoolClass.objects.none()
        return SchoolClass.objects.all().order_by('id')

    def update(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) != 'admin':
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

        instance = self.get_object()
        raw_data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        name = (raw_data.get('name') or instance.name).strip()
        grade = (raw_data.get('grade') or instance.grade or '').strip()
        academic_year = (raw_data.get('academic_year') or instance.academic_year or str(date.today().year)).strip()
        status_value = (raw_data.get('status') or instance.status).strip()

        if not name:
            return Response({'detail': 'Class name is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not grade and name.lower().startswith('grade '):
            grade = name
        if not grade:
            grade = 'Unassigned'
        if status_value not in ['Active', 'Inactive']:
            return Response({'detail': 'Status is invalid.'}, status=status.HTTP_400_BAD_REQUEST)
        if SchoolClass.objects.filter(name=name, grade=grade, academic_year=academic_year).exclude(id=instance.id).exists():
            return Response({'detail': 'A class with this name, grade, and academic year already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        raw_data['name'] = name
        raw_data['grade'] = grade
        raw_data['academic_year'] = academic_year
        raw_data['status'] = status_value

        serializer = self.get_serializer(instance, data=raw_data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def delete(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) != 'admin':
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        instance = self.get_object()
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def perform_destroy(self, instance):
        instance.delete()


class TimetableListCreateView(generics.ListCreateAPIView):
    queryset = TimetableEntry.objects.all().order_by('day', 'start_time')
    serializer_class = TimetableEntrySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if is_admin(self.request.user):
            return TimetableEntry.objects.all().order_by('day', 'start_time')
        teacher = Teacher.objects.filter(user=self.request.user).first()
        if getattr(self.request.user, 'role', None) == 'teacher' and teacher:
            return TimetableEntry.objects.filter(teacher=teacher).order_by('day', 'start_time')
        return TimetableEntry.objects.none()

    def _conflicts_with_existing(self, day, start_time, end_time, school_class_id=None, teacher_id=None, exclude_id=None):
        queryset = TimetableEntry.objects.filter(day=day)
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        if school_class_id:
            queryset = queryset.filter(school_class_id=school_class_id)
        if teacher_id:
            queryset = queryset.filter(teacher_id=teacher_id)

        try:
            start_time_value = datetime.strptime(str(start_time), '%H:%M').time()
            end_time_value = datetime.strptime(str(end_time), '%H:%M').time()
        except ValueError:
            try:
                start_time_value = datetime.strptime(str(start_time), '%H:%M:%S').time()
                end_time_value = datetime.strptime(str(end_time), '%H:%M:%S').time()
            except ValueError:
                return False

        for entry in queryset:
            existing_start = entry.start_time
            existing_end = entry.end_time
            if start_time_value < existing_end and end_time_value > existing_start:
                return True
        return False

    def post(self, request, *args, **kwargs):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        data = request.data
        if not isinstance(data, dict):
            return super().post(request, *args, **kwargs)

        school_class_id = data.get('school_class')
        teacher_id = data.get('teacher')
        day = data.get('day')
        start_time = data.get('start_time')
        end_time = data.get('end_time')

        if not all([day, school_class_id, teacher_id, start_time, end_time]):
            return Response({'detail': 'Please complete all timetable fields.'}, status=status.HTTP_400_BAD_REQUEST)

        if str(end_time) <= str(start_time):
            return Response({'detail': 'End time must be after start time.'}, status=status.HTTP_400_BAD_REQUEST)

        if not Teacher.objects.filter(id=teacher_id, assigned_classes__id=school_class_id, status='Active').exists():
            return Response({'detail': 'Teacher is not assigned to the selected class.'}, status=status.HTTP_400_BAD_REQUEST)

        if self._conflicts_with_existing(day, start_time, end_time, school_class_id=school_class_id, teacher_id=teacher_id):
            return Response({'detail': 'Schedule conflict: this teacher is already assigned to another class at this time.'}, status=status.HTTP_400_BAD_REQUEST)

        if self._conflicts_with_existing(day, start_time, end_time, school_class_id=school_class_id):
            return Response({'detail': 'Schedule conflict: this class already has a subject scheduled at this time.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(data=data)
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError as exc:
            return Response({'detail': exc.detail}, status=status.HTTP_400_BAD_REQUEST)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class TimetableDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TimetableEntrySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if is_admin(self.request.user):
            return TimetableEntry.objects.all()
        teacher = Teacher.objects.filter(user=self.request.user).first()
        return TimetableEntry.objects.filter(teacher=teacher) if teacher else TimetableEntry.objects.none()

    def update(self, request, *args, **kwargs):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)


class AttendanceListCreateView(generics.ListCreateAPIView):
    queryset = Attendance.objects.all().order_by('-attendance_date', '-id')
    serializer_class = AttendanceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if getattr(user, 'role', None) == 'admin':
            return Attendance.objects.all().order_by('-attendance_date', '-id')
        if getattr(user, 'role', None) == 'teacher':
            teacher = Teacher.objects.filter(user=user).first()
            if not teacher:
                return Attendance.objects.none()
            return Attendance.objects.filter(school_class__in=teacher.assigned_classes.all()).order_by('-attendance_date', '-id')
        return Attendance.objects.none()

    def _can_manage_class(self, user, school_class_id):
        if getattr(user, 'role', None) == 'admin':
            return True
        if getattr(user, 'role', None) != 'teacher':
            return False
        teacher = Teacher.objects.filter(user=user).first()
        if not teacher:
            return False
        return teacher.assigned_classes.filter(id=school_class_id).exists()

    def post(self, request, *args, **kwargs):
        data = request.data
        if isinstance(data, list):
            created = []
            for item in data:
                attendance_date = item.get('attendance_date')
                student_id = item.get('student')
                school_class_id = item.get('school_class')
                if not attendance_date or not student_id:
                    return Response({'detail': 'Student and date are required.'}, status=status.HTTP_400_BAD_REQUEST)

                student = Student.objects.filter(id=student_id).first()
                if not student:
                    return Response({'detail': 'Student not found.'}, status=status.HTTP_400_BAD_REQUEST)
                school_class_id = school_class_id or student.school_class_id
                if not school_class_id:
                    return Response({'detail': 'Student, class, and date are required.'}, status=status.HTTP_400_BAD_REQUEST)

                if not self._can_manage_class(request.user, school_class_id):
                    return Response({'detail': 'Teacher is not assigned to this class.'}, status=status.HTTP_403_FORBIDDEN)

                if Attendance.objects.filter(student_id=student_id, school_class_id=school_class_id, attendance_date=attendance_date).exists():
                    return Response({'detail': 'Attendance has already been recorded for this class today.'}, status=status.HTTP_400_BAD_REQUEST)

                obj = Attendance.objects.create(
                    student=student,
                    school_class_id=school_class_id,
                    attendance_date=attendance_date,
                    status=item.get('status', 'Present'),
                    remarks=item.get('remarks', ''),
                    recorded_by=request.user,
                )
                created.append(AttendanceSerializer(obj).data)
            return Response(created, status=status.HTTP_201_CREATED)

        if not isinstance(data, dict):
            return Response({'detail': 'Invalid attendance payload.'}, status=status.HTTP_400_BAD_REQUEST)

        student_id = data.get('student')
        attendance_date = data.get('attendance_date')
        if not student_id or not attendance_date:
            return Response({'detail': 'Student and date are required.'}, status=status.HTTP_400_BAD_REQUEST)

        student = Student.objects.filter(id=student_id).first()
        if not student:
            return Response({'detail': 'Student not found.'}, status=status.HTTP_400_BAD_REQUEST)

        school_class_id = data.get('school_class') or data.get('class_id') or student.school_class_id
        if not school_class_id:
            return Response({'detail': 'Student, class, and date are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if not self._can_manage_class(request.user, school_class_id):
            return Response({'detail': 'Teacher is not assigned to this class.'}, status=status.HTTP_403_FORBIDDEN)

        if Attendance.objects.filter(student_id=student_id, school_class_id=school_class_id, attendance_date=attendance_date).exists():
            return Response({'detail': 'Attendance has already been recorded for this class today.'}, status=status.HTTP_400_BAD_REQUEST)

        payload = dict(data)
        payload['school_class'] = school_class_id
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AttendanceDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Attendance.objects.all().order_by('-attendance_date', '-id')
    serializer_class = AttendanceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if getattr(user, 'role', None) == 'admin':
            return Attendance.objects.all().order_by('-attendance_date', '-id')
        if getattr(user, 'role', None) == 'teacher':
            teacher = Teacher.objects.filter(user=user).first()
            if not teacher:
                return Attendance.objects.none()
            return Attendance.objects.filter(school_class__in=teacher.assigned_classes.all()).order_by('-attendance_date', '-id')
        return Attendance.objects.none()

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if getattr(request.user, 'role', None) != 'admin':
            teacher = Teacher.objects.filter(user=request.user).first()
            if not teacher or not teacher.assigned_classes.filter(id=instance.school_class_id).exists():
                return Response({'detail': 'Teacher is not assigned to this class.'}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)


class ExamListCreateView(generics.ListCreateAPIView):
    queryset = Exam.objects.all().order_by('-exam_date')
    serializer_class = ExamSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if is_admin(self.request.user):
            return Exam.objects.all().order_by('-exam_date', '-id')
        teacher = Teacher.objects.filter(user=self.request.user).first()
        return Exam.objects.filter(school_class__in=teacher.assigned_classes.all()).order_by('-exam_date', '-id') if teacher else Exam.objects.none()

    def create(self, request, *args, **kwargs):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)


class ExamDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ExamSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if is_admin(self.request.user):
            return Exam.objects.all()
        teacher = Teacher.objects.filter(user=self.request.user).first()
        return Exam.objects.filter(school_class__in=teacher.assigned_classes.all()) if teacher else Exam.objects.none()

    def update(self, request, *args, **kwargs):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)


class ResultListCreateView(generics.ListCreateAPIView):
    queryset = Result.objects.all().order_by('-id')
    serializer_class = ResultSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if is_admin(self.request.user):
            return Result.objects.all().order_by('-id')
        teacher = Teacher.objects.filter(user=self.request.user).first()
        return Result.objects.filter(exam__school_class__in=teacher.assigned_classes.all()).order_by('-id') if teacher else Result.objects.none()

    def create(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) == 'teacher':
            teacher = Teacher.objects.filter(user=request.user).first()
            exam = Exam.objects.filter(id=request.data.get('exam'), school_class__in=teacher.assigned_classes.all() if teacher else []).first()
            student = Student.objects.filter(id=request.data.get('student'), school_class__in=teacher.assigned_classes.all() if teacher else []).first()
            allowed_subjects = set([teacher.subject] + list(TimetableEntry.objects.filter(teacher=teacher).values_list('subject', flat=True))) if teacher else set()
            if not exam or not student or request.data.get('subject') not in allowed_subjects:
                return Response({'detail': 'Teacher is not assigned to this class or subject.'}, status=status.HTTP_403_FORBIDDEN)
            return super().create(request, *args, **kwargs)
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)


class ResultDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ResultSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if is_admin(self.request.user):
            return Result.objects.all()
        teacher = Teacher.objects.filter(user=self.request.user).first()
        return Result.objects.filter(exam__school_class__in=teacher.assigned_classes.all()) if teacher else Result.objects.none()

    def update(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) == 'teacher':
            teacher = Teacher.objects.filter(user=request.user).first()
            if not teacher or request.data.get('subject') not in set([teacher.subject] + list(TimetableEntry.objects.filter(teacher=teacher).values_list('subject', flat=True))):
                return Response({'detail': 'Teacher is not assigned to this subject.'}, status=status.HTTP_403_FORBIDDEN)
        elif not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)


class FeePaymentListCreateView(generics.ListCreateAPIView):
    queryset = FeePayment.objects.all().order_by('-payment_date', '-id')
    serializer_class = FeePaymentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        fee_id = request.data.get('fee')
        if not fee_id:
            return Response({'detail': 'Fee is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            fee = Fee.objects.get(id=fee_id)
        except Fee.DoesNotExist:
            return Response({'detail': 'Fee not found.'}, status=status.HTTP_404_NOT_FOUND)

        payment_amount = float(request.data.get('amount', 0) or 0)
        if payment_amount <= 0:
            return Response({'detail': 'Payment amount must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)
        if payment_amount > float(fee.remaining_amount or fee.amount or 0):
            return Response({'detail': 'Payment amount cannot exceed the remaining fee.'}, status=status.HTTP_400_BAD_REQUEST)

        payload = dict(request.data)
        payload['recorded_by'] = request.user.id
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        fee.refresh_from_db()
        fee.paid_amount = sum(item.amount for item in fee.payments.all())
        fee.remaining_amount = max(float(fee.total_due or fee.amount) - float(fee.paid_amount), 0)
        fee.status = 'Paid' if fee.remaining_amount == 0 else 'Partially Paid' if fee.paid_amount > 0 else 'Pending'
        fee.save(update_fields=['paid_amount', 'remaining_amount', 'status'])
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def get_queryset(self):
        return FeePayment.objects.all().order_by('-payment_date', '-id') if is_admin(self.request.user) else FeePayment.objects.none()


class FeeListCreateView(generics.ListCreateAPIView):
    queryset = Fee.objects.all().order_by('-payment_date', '-id')
    serializer_class = FeeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        student_id = request.data.get('student')
        amount = request.data.get('amount')
        if not student_id:
            return Response({'detail': 'Student is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if amount is None or float(amount) <= 0:
            return Response({'detail': 'Amount must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)

        student = Student.objects.filter(id=student_id).first()
        if not student:
            return Response({'detail': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)

        payload = dict(request.data)
        payload['school_class'] = payload.get('school_class') or student.school_class_id
        payload['created_by'] = request.user.id
        payload['total_due'] = payload.get('total_due') or amount
        payload['paid_amount'] = 0
        payload['remaining_amount'] = payload.get('total_due') or amount
        payload['status'] = 'Pending'
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        fee = serializer.save()
        fee.paid_amount = 0
        fee.remaining_amount = fee.total_due or fee.amount
        fee.status = 'Pending'
        fee.save(update_fields=['paid_amount', 'remaining_amount', 'status'])
        return Response(FeeSerializer(fee).data, status=status.HTTP_201_CREATED)

    def get_queryset(self):
        return Fee.objects.all().order_by('-payment_date', '-id') if is_admin(self.request.user) else Fee.objects.none()


class FeeDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Fee.objects.all()
    serializer_class = FeeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def check_admin(self, request):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return None

    def retrieve(self, request, *args, **kwargs):
        error = self.check_admin(request)
        return error or super().retrieve(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        fee = self.get_object()
        if fee.payments.exists():
            data = request.data.copy()
            data.pop('amount', None)
            data.pop('paid_amount', None)
            data.pop('remaining_amount', None)
            data.pop('status', None)
            serializer = self.get_serializer(fee, data=data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        error = self.check_admin(request)
        return error or super().destroy(request, *args, **kwargs)


class HomeworkListCreateView(generics.ListCreateAPIView):
    queryset = Homework.objects.all().order_by('-created_at')
    serializer_class = HomeworkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if is_admin(self.request.user):
            return Homework.objects.all().order_by('-created_at')
        teacher = Teacher.objects.filter(user=self.request.user).first()
        return Homework.objects.filter(school_class__in=teacher.assigned_classes.all()).order_by('-created_at') if teacher else Homework.objects.none()

    def create(self, request, *args, **kwargs):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)


class AnnouncementListCreateView(generics.ListCreateAPIView):
    queryset = Announcement.objects.all().order_by('-created_at')
    serializer_class = AnnouncementSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if is_admin(self.request.user):
            return Announcement.objects.all().order_by('-created_at')
        now = timezone.now()
        visible = Q(status='Published') & (Q(publish_at__isnull=True) | Q(publish_at__lte=now)) & (Q(expires_at__isnull=True) | Q(expires_at__gt=now))
        if getattr(self.request.user, 'role', None) == 'teacher':
            teacher = Teacher.objects.filter(user=self.request.user).first()
            class_ids = teacher.assigned_classes.values_list('id', flat=True) if teacher else []
            return Announcement.objects.filter(visible & (Q(audience__in=['Everyone', 'Teachers']) | Q(audience='Class', school_class_id__in=class_ids))).order_by('-created_at')
        return Announcement.objects.filter(visible & Q(audience__in=['Everyone', 'Students'])).order_by('-created_at')

    def create(self, request, *args, **kwargs):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        payload = request.data.copy()
        payload['created_by'] = request.user.id
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=self.get_success_headers(serializer.data))


class AnnouncementDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Announcement.objects.all()
    serializer_class = AnnouncementSerializer
    permission_classes = [permissions.IsAuthenticated]

    def check_admin(self, request):
        if not is_admin(request.user):
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
        return None

    def retrieve(self, request, *args, **kwargs):
        if is_admin(request.user):
            return super().retrieve(request, *args, **kwargs)
        now = timezone.now()
        visible = Q(status='Published') & (Q(publish_at__isnull=True) | Q(publish_at__lte=now)) & (Q(expires_at__isnull=True) | Q(expires_at__gt=now))
        queryset = Announcement.objects.filter(visible & Q(audience__in=['Everyone', 'Teachers', 'Students']))
        if getattr(request.user, 'role', None) == 'teacher':
            teacher = Teacher.objects.filter(user=request.user).first()
            class_ids = teacher.assigned_classes.values_list('id', flat=True) if teacher else []
            queryset = Announcement.objects.filter(visible & (Q(audience__in=['Everyone', 'Teachers']) | Q(audience='Class', school_class_id__in=class_ids)))
        instance = queryset.filter(pk=kwargs.get('pk')).first()
        if not instance:
            return Response({'detail': 'Announcement not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(instance).data)

    def update(self, request, *args, **kwargs):
        error = self.check_admin(request)
        return error or super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        error = self.check_admin(request)
        return error or super().destroy(request, *args, **kwargs)


class SchoolSettingsView(generics.RetrieveUpdateAPIView):
    serializer_class = SchoolSettingsSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        if not is_admin(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Admin access required.')
        settings, _ = SchoolSettings.objects.get_or_create(pk=1)
        return settings
