"""School APIs use verified membership context; platform APIs are deliberately separate."""
import csv
from decimal import Decimal
from io import StringIO

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction, IntegrityError
from django.db.models import Q, Sum, F
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError, AuthenticationFailed

from .models import (School, Membership, AuditEvent, User, SchoolClass, Student, Teacher, Attendance,
                     Exam, Result, Fee, FeePayment, Homework, Announcement, SchoolSettings,
                     TimetableEntry, Guardian, Enrollment)
from .serializers import (SchoolSerializer, UserSerializer, SchoolClassSerializer, StudentSerializer,
                          TeacherSerializer, AttendanceSerializer, ExamSerializer, ResultSerializer,
                          FeeSerializer, FeePaymentSerializer, HomeworkSerializer, AnnouncementSerializer,
                          SchoolSettingsSerializer, TimetableEntrySerializer, GuardianSerializer, EnrollmentSerializer)
from .permissions import SchoolAccess, SchoolAdmin, PlatformAdmin, is_admin, teacher_for, authorized_classes, authorized_subjects
from .authentication import issue_tokens, verify_session
from .tenancy import school_context
from .throttling import login_attempt


class InputAPIView(APIView):
    allow_list = False

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method in ('POST', 'PUT', 'PATCH') and not isinstance(request.data, dict) and not (self.allow_list and isinstance(request.data, list)):
            raise ValidationError('Submit a valid form object.')


def audit(request, action, target='', school=None):
    AuditEvent.objects.create(actor=request.user, school=school or getattr(request, 'school', None), action=action, target=str(target)[:120])


def identifier(value):
    try:
        if isinstance(value, bool):
            raise ValueError
        result = int(value)
        if str(result) != str(value) or result < 1 or result > 2**63 - 1:
            raise ValueError
        return result
    except (ValueError, TypeError, OverflowError):
        raise ValidationError('Choose a valid record.')


def password_value(data, key):
    return serializers.CharField(max_length=1024, trim_whitespace=False).run_validation(data.get(key, ''))


def active_memberships(user):
    return Membership.objects.select_related('school').filter(user=user, is_active=True, school__is_active=True)


def session_payload(request, user, membership=None):
    request.membership = membership
    return {**issue_tokens(user, membership), 'user': UserSerializer(user, context={'request': request}).data,
            'school': SchoolSerializer(membership.school, context={'request': request}).data if membership else None,
            'memberships': [{'school': SchoolSerializer(m.school, context={'request': request}).data, 'role': m.role} for m in active_memberships(user)]}


class LoginView(InputAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        username = str(request.data.get('username', '')).strip()
        password = request.data.get('password')
        if not isinstance(password, str) or len(username) > 150 or len(password) > 1024:
            raise ValidationError('Enter a valid username and password.')
        with login_attempt(request, username) as attempt:
            user = authenticate(username=username, password=password)
            attempt['success'] = bool(user and user.is_active)
        if not user or not user.is_active:
            return Response({'detail': 'Invalid username or password.'}, status=401)
        memberships = active_memberships(user)
        if not user.is_superuser and not memberships.exists():
            return Response({'detail': 'No active school access. Contact your administrator.'}, status=403)
        slug = request.data.get('school_slug')
        membership = memberships.filter(school__slug=slug).first() if slug else memberships.first() if memberships.count() == 1 and not user.is_superuser else None
        if slug and membership is None:
            return Response({'detail': 'No active access to this school.'}, status=403)
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
        request.user = user
        if membership and user.is_superuser:
            audit(request, 'platform_school_access', membership.school_id, membership.school)
        return Response(session_payload(request, user, membership))


class SessionRefreshView(InputAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            with transaction.atomic():
                token = RefreshToken(serializers.CharField(max_length=8192).run_validation(request.data.get('refresh', '')))
                user = User.objects.select_for_update().get(pk=token['user_id'])
                token.check_blacklist()
                verify_session(user, token)
                token.blacklist()
                membership = active_memberships(user).filter(school_id=token.get('school_id')).first() if token.get('school_id') else None
                return Response(issue_tokens(user, membership))
        except (TokenError, User.DoesNotExist, KeyError, AuthenticationFailed):
            return Response({'detail': 'This session ended. Please sign in again.'}, status=401)


class SchoolSelectionView(InputAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response([{'school': SchoolSerializer(m.school, context={'request': request}).data, 'role': m.role} for m in active_memberships(request.user)])

    def post(self, request):
        if request.user.must_change_password:
            raise PermissionDenied('Change your temporary password first.')
        membership = get_object_or_404(active_memberships(request.user), school_id=identifier(request.data.get('school_id')))
        audit(request, 'platform_school_access' if request.user.is_superuser else 'school_switch', membership.school_id, membership.school)
        return Response(session_payload(request, request.user, membership))


class ForgotPasswordView(InputAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        return Response({'detail': 'Contact your school administrator to verify your identity and reset your password.'})


class PublicSchoolBrandingView(InputAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, slug=None):
        slug = slug or request.query_params.get('slug')
        if not slug:
            return Response({'school_name': 'School Workspace', 'logo': None})
        school = get_object_or_404(School, slug=slug, is_active=True)
        return Response({'school_name': school.name, 'slug': school.slug, 'logo': request.build_absolute_uri(school.logo.url) if school.logo else None, 'appearance': school.appearance})


class ChangePasswordView(InputAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not request.user.check_password(password_value(request.data, 'current_password')):
            raise ValidationError({'current_password': 'Current password is incorrect.'})
        password = password_value(request.data, 'new_password')
        try:
            validate_password(password, request.user)
        except DjangoValidationError as exc:
            raise ValidationError({'new_password': exc.messages})
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=request.user.pk)
            user.set_password(password)
            user.must_change_password = False
            user.session_version += 1
            user.save(update_fields=['password', 'must_change_password', 'session_version'])
            request.user = user
            membership = active_memberships(user).filter(school_id=request.auth.get('school_id')).first() if request.auth.get('school_id') else None
            audit(request, 'password_changed', f'user:{user.pk}', membership.school if membership else None)
            return Response(session_payload(request, user, membership))


class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        if any(key in request.data for key in ['role', 'is_superuser', 'is_staff', 'is_active', 'school_id', 'session_version', 'username', 'email']):
            raise ValidationError('Account privileges and identity cannot be changed through profile editing.')
        return super().update(request, *args, **kwargs)


class LogoutAllView(InputAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        User.objects.filter(pk=request.user.pk).update(session_version=F('session_version') + 1, last_logout_at=timezone.now())
        audit(request, 'logout_all', f'user:{request.user.pk}')
        return Response({'detail': 'All sessions have ended.'})


class LogoutView(InputAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            token = RefreshToken(serializers.CharField(max_length=8192).run_validation(request.data.get('refresh', '')))
            if str(token['user_id']) == str(request.user.pk):
                token.blacklist()
        except (TokenError, KeyError):
            pass
        return Response({'detail': 'Signed out.'})


class PlatformSchoolsView(generics.ListCreateAPIView):
    serializer_class = SchoolSerializer
    permission_classes = [PlatformAdmin]

    def get_queryset(self):
        return School.objects.order_by('name')

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        if not isinstance(request.data, dict):
            raise ValidationError('Submit a valid school form.')
        data = request.data.copy()
        password = data.pop('admin_password', '')
        username = data.pop('admin_username', '')
        email = data.pop('admin_email', '')
        # MultiValueDict pop returns lists for multipart data.
        password = password[0] if isinstance(password, list) else password
        username = username[0] if isinstance(username, list) else username
        email = email[0] if isinstance(email, list) else email
        username = serializers.CharField(max_length=150).run_validation(username)
        email = serializers.EmailField(allow_blank=True).run_validation(email)
        password = serializers.CharField(max_length=1024, trim_whitespace=False).run_validation(password)
        if not username or User.objects.filter(username=username).exists():
            raise ValidationError({'admin_username': 'Choose a new, unique administrator username.'})
        try:
            validate_password(password)
        except DjangoValidationError as exc:
            raise ValidationError({'admin_password': exc.messages})
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        school = serializer.save()
        if school.logo:
            # New-school uploads need an ID in their storage path.
            old_logo = school.logo
            school.logo.save(old_logo.name.split('/')[-1], old_logo.file, save=True)
            old_logo.storage.delete(old_logo.name)
        user = User.objects.create_user(username=username, email=email, password=password, must_change_password=True)
        Membership.objects.create(user=user, school=school, role='admin')
        with school_context(school.pk):
            SchoolSettings.objects.create(school_name=school.name, teaching_days=['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'], grading_scale={'A': 90, 'B': 80, 'C': 70, 'D': 60, 'E': 0})
        audit(request, 'school_created', f'school:{school.pk}', school)
        audit(request, 'membership_created', f'user:{user.pk}:admin', school)
        return Response(SchoolSerializer(school, context={'request': request}).data, status=201)


class PlatformSchoolDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = SchoolSerializer
    permission_classes = [PlatformAdmin]
    queryset = School.objects.all()

    @transaction.atomic
    def perform_update(self, serializer):
        school = serializer.save()
        if 'is_active' in self.request.data:
            Membership.objects.filter(school=school).update(version=F('version') + 1)
        with school_context(school.pk):
            config, _ = SchoolSettings.objects.get_or_create(school=school, defaults={'school_name': school.name})
            config.school_name = school.name
            config.logo = school.logo
            config.save()
        audit(self.request, 'school_updated' if school.is_active else 'school_suspended', f'school:{school.pk}', school)


class PlatformMembershipView(InputAPIView):
    permission_classes = [PlatformAdmin]

    def get(self, request, pk):
        school = get_object_or_404(School, pk=pk)
        with school_context(school.pk):
            teacher_accounts = set(Teacher.objects.values_list('user_id', flat=True))
        return Response([{'id': m.pk, 'username': m.user.username, 'role': m.role, 'is_active': m.is_active, 'platform': m.user.is_superuser, 'teacher_profile': m.user_id in teacher_accounts} for m in Membership.objects.filter(school=school).select_related('user')])

    @transaction.atomic
    def post(self, request, pk):
        school = get_object_or_404(School, pk=pk)
        role = request.data.get('role', 'admin')
        if role not in ['admin', 'teacher'] or any(key in request.data for key in ['is_superuser', 'is_staff']):
            raise ValidationError('Choose School Admin or Teacher.')
        username = str(request.data.get('username', '')).strip()
        user = User.objects.filter(username=username).first()
        with school_context(school.pk):
            if role == 'teacher' and (not user or not Teacher.objects.filter(user=user).exists()):
                raise ValidationError('Create the teacher profile and account in the school workspace first.')
        if not user:
            password = password_value(request.data, 'temporary_password')
            try:
                validate_password(password)
            except DjangoValidationError as exc:
                raise ValidationError({'temporary_password': exc.messages})
            if not username:
                raise ValidationError('Username is required.')
            user = User.objects.create_user(username=username, password=password, must_change_password=True)
        if user.is_superuser:
            raise ValidationError('Use the explicit platform access action for platform accounts.')
        member, _ = Membership.objects.get_or_create(user=user, school=school, defaults={'role': role})
        member.role = role
        member.is_active = request.data.get('is_active', True) in (True, 'true', 'True')
        member.version += 1
        member.save()
        audit(request, 'membership_changed', f'membership:{member.pk}:{role}', school)
        return Response({'id': member.pk, 'role': role, 'is_active': member.is_active})


class PlatformSchoolAccessView(InputAPIView):
    permission_classes = [PlatformAdmin]

    @transaction.atomic
    def post(self, request, pk):
        school = get_object_or_404(School, pk=pk, is_active=True)
        membership, created = Membership.objects.get_or_create(user=request.user, school=school, defaults={'role': 'admin'})
        if not membership.is_active:
            raise PermissionDenied('This platform account membership has been revoked.')
        if created:
            audit(request, 'platform_membership_granted', f'membership:{membership.pk}', school)
        audit(request, 'platform_school_access', f'school:{school.pk}', school)
        return Response(session_payload(request, request.user, membership))


class PlatformAuditView(InputAPIView):
    permission_classes = [PlatformAdmin]

    def get(self, request):
        rows = AuditEvent.objects.select_related('actor', 'school').order_by('-created_at')[:200]
        return Response([{'id': item.pk, 'actor': item.actor.username if item.actor else 'Deleted account', 'school': item.school.name if item.school else 'Platform', 'action': item.action, 'target': item.target, 'created_at': item.created_at} for item in rows])


class PlatformPasswordResetView(InputAPIView):
    permission_classes = [PlatformAdmin]

    @transaction.atomic
    def post(self, request, pk):
        member = get_object_or_404(Membership.objects.select_related('user', 'school'), pk=pk)
        if member.user.is_superuser:
            raise PermissionDenied('Platform accounts must use their own password recovery process.')
        user = User.objects.select_for_update().get(pk=member.user_id)
        password = password_value(request.data, 'temporary_password')
        try:
            validate_password(password, user)
        except DjangoValidationError as exc:
            raise ValidationError({'temporary_password': exc.messages})
        user.set_password(password)
        user.must_change_password = True
        user.session_version += 1
        user.save(update_fields=['password', 'must_change_password', 'session_version'])
        audit(request, 'platform_password_reset', f'user:{user.pk}', member.school)
        return Response({'detail': 'Temporary password set. Sessions in all schools have ended.'})


class SchoolBrandingView(generics.RetrieveUpdateAPIView):
    permission_classes = [SchoolAdmin]
    serializer_class = SchoolSerializer

    def get_object(self):
        return self.request.school

    def update(self, request, *args, **kwargs):
        if set(request.data) - {'name', 'logo', 'appearance'}:
            raise ValidationError('Only school name, logo, and accent color can be changed here.')
        return super().update(request, *args, **kwargs)

    @transaction.atomic
    def perform_update(self, serializer):
        school = serializer.save()
        config = school_settings(self.request)
        config.school_name, config.logo = school.name, school.logo
        config.save(update_fields=['school_name', 'logo'])
        audit(self.request, 'school_branding_updated', school.pk)


class OptionalPagination(PageNumberPagination):
    page_size = 30
    page_size_query_param = 'page_size'
    max_page_size = 100

    def paginate_queryset(self, queryset, request, view=None):
        # Compatibility with existing consumers; new frontend explicitly requests pages.
        return super().paginate_queryset(queryset, request, view) if 'page' in request.query_params else None


class ResourceMixin:
    permission_classes = [SchoolAccess]
    pagination_class = OptionalPagination
    admin_write = True
    model = None

    def get_queryset(self):
        request = self.request
        if self.model in (Teacher, Fee, FeePayment) and not is_admin(request):
            raise PermissionDenied('School administrator access is required.')
        qs = self.model.objects.all().order_by('-pk')
        ids = authorized_classes(request).values_list('pk', flat=True)
        if not is_admin(request):
            if self.model is Teacher or self.model in (Fee, FeePayment):
                return qs.none()
            if self.model is SchoolClass:
                qs = qs.filter(pk__in=ids)
            elif self.model is Student:
                qs = qs.filter(school_class_id__in=ids, is_active=True)
            elif self.model is Result:
                qs = qs.filter(exam__school_class_id__in=ids)
            elif self.model is Guardian or self.model is Enrollment:
                qs = qs.filter(student__school_class_id__in=ids)
            elif self.model is TimetableEntry:
                qs = qs.filter(school_class_id__in=ids) if request.query_params.get('view') == 'class' else qs.filter(teacher=teacher_for(request))
            elif self.model is Announcement:
                now = timezone.now()
                qs = qs.filter(status='Published').filter(Q(publish_at__isnull=True) | Q(publish_at__lte=now)).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now)).filter(Q(audience__in=['Everyone', 'Teachers']) | Q(audience='Class', school_class_id__in=ids))
            else:
                qs = qs.filter(school_class_id__in=ids)
        if self.model is Fee:
            qs = qs.filter(is_active=True).select_related('student', 'school_class').prefetch_related('payments')
            if request.method in ('PUT', 'PATCH', 'DELETE'):
                qs = qs.select_for_update()
        elif self.model is Student:
            qs = qs.select_related('school_class').prefetch_related('fees')
        elif self.model is Teacher:
            qs = qs.select_related('user').prefetch_related('assigned_classes')
        elif self.model is Attendance:
            qs = qs.select_related('student', 'school_class', 'recorded_by')
        elif self.model is Result:
            qs = qs.select_related('student', 'exam')
        elif self.model is Announcement:
            qs = qs.select_related('created_by', 'school_class')
        elif self.model is Enrollment:
            qs = qs.select_related('school_class')
        if self.model is Student and request.query_params.get('status') in ('Active', 'Inactive'):
            qs = qs.filter(is_active=request.query_params['status'] == 'Active')
        if self.model is Attendance and request.query_params.get('attendance_date'):
            selected_date = serializers.DateField().run_validation(request.query_params['attendance_date'])
            qs = qs.filter(attendance_date=selected_date)
        if self.model is Fee and request.query_params.get('outstanding') == 'true':
            qs = qs.filter(remaining_amount__gt=0)
        for name in ['student', 'exam', 'school_class', 'teacher', 'fee', 'status', 'academic_year', 'gender']:
            value = request.query_params.get(name)
            if value and any(field.name == name for field in self.model._meta.fields):
                if name in ['student', 'exam', 'school_class', 'teacher', 'fee'] and not value.isdigit():
                    raise ValidationError('Choose a valid record.')
                qs = qs.filter(**{name: value})
        search = request.query_params.get('search', '').strip()
        if search:
            names = [f.name for f in self.model._meta.fields if f.name in ['name', 'title', 'student_id', 'teacher_id', 'subject']]
            if self.model in (Fee, Result, Attendance):
                names += ['student__name', 'student__student_id']
            if self.model is Fee:
                names += ['fee_type', 'billing_period']
            if self.model is Announcement:
                names += ['content']
            if self.model is TimetableEntry:
                names += ['school_class__name', 'teacher__name', 'day']
            if names:
                condition = Q()
                for name in names:
                    condition |= Q(**{name + '__icontains': search})
                qs = qs.filter(condition)
        ordering = request.query_params.get('ordering')
        fields = {field.name for field in self.model._meta.fields}
        allowed_ordering = fields & {'name', 'title', 'student_id', 'teacher_id', 'grade', 'academic_year', 'created_at', 'due_date', 'exam_date'}
        if ordering:
            if ordering.lstrip('-') not in allowed_ordering:
                raise ValidationError('Choose a supported sort order.')
            qs = qs.order_by(ordering, 'pk')
        elif 'name' in allowed_ordering:
            qs = qs.order_by('name', 'pk')
        return qs

    def check_write(self):
        if self.admin_write and not is_admin(self.request):
            raise PermissionDenied('School administrator access is required.')

    @transaction.atomic
    def perform_create(self, serializer):
        self.check_write()
        if self.model in (TimetableEntry, Fee, Attendance):
            # Serialize scheduling changes for a school, including concurrent creates.
            School.objects.select_for_update().get(pk=self.request.school.pk)
            serializer.is_valid(raise_exception=True)
            serializer.validate(serializer.validated_data)
        kwargs = {'school': self.request.school}
        if self.model in [Homework, Announcement]:
            kwargs['created_by'] = self.request.user
        if self.model is Attendance:
            from .attendance import save_register
            rows, _ = save_register(self.request, [serializer.validated_data])
            serializer.instance = rows[0]
            return
        if self.model is Fee:
            kwargs['created_by'] = self.request.user
        obj = serializer.save(**kwargs)
        if self.model is Student:
            Enrollment.objects.create(student=obj, school_class=obj.school_class, academic_year=obj.school_class.academic_year or school_settings(self.request).academic_year)
        if self.model is Fee:
            obj.recalculate_totals()
        if self.model in (Homework, Exam, Announcement, TimetableEntry):
            from .notifications import notify
            if self.model is not Announcement or (obj.status == 'Published' and (not obj.publish_at or obj.publish_at <= timezone.now())):
                notify(self.request.school, f'{self.model._meta.model_name}:{obj.pk}', f'New {self.model._meta.verbose_name}',
                       str(getattr(obj, 'title', None) or getattr(obj, 'name', None) or obj),
                       {Homework: 'homework', Exam: 'exams', Announcement: 'announcements', TimetableEntry: 'timetable'}[self.model],
                       getattr(obj, 'school_class', None), self.request.user.pk)
        audit(self.request, f'{self.model._meta.model_name}_created', obj.pk)

    @transaction.atomic
    def perform_update(self, serializer):
        self.check_write()
        if self.model is TimetableEntry:
            School.objects.select_for_update().get(pk=self.request.school.pk)
            serializer.validate(serializer.validated_data)
        obj = serializer.save()
        if self.model is Fee:
            obj.recalculate_totals()
        if self.model is Teacher and obj.user_id:
            Membership.objects.filter(user_id=obj.user_id, school=self.request.school).update(is_active=obj.status == 'Active', version=F('version') + 1)
        audit(self.request, f'{self.model._meta.model_name}_updated', obj.pk)

    def perform_destroy(self, instance):
        self.check_write()
        if not is_admin(self.request):
            raise PermissionDenied('Only the school administrator can archive records.')
        with transaction.atomic():
            if self.model is Student:
                instance.is_active = False
                instance.save(update_fields=['is_active'])
            elif self.model is Teacher or self.model is SchoolClass:
                instance.status = 'Inactive'
                instance.save(update_fields=['status'])
                if self.model is Teacher and instance.user_id:
                    Membership.objects.filter(user_id=instance.user_id, school=self.request.school).update(is_active=False, version=F('version') + 1)
            elif self.model is Fee:
                if instance.payments.exists():
                    raise ValidationError('Invoices with payments must be preserved. Correct the invoice instead.')
                instance.is_active = False
                instance.save(update_fields=['is_active'])
                instance.recalculate_totals()
            elif self.model is Exam:
                raise ValidationError('Examinations are historical records. Edit the details instead of deleting them.')
            else:
                instance.delete()
            audit(self.request, f'{self.model._meta.model_name}_archived', instance.pk or '')


class ResourceList(ResourceMixin, generics.ListCreateAPIView):
    def create(self, request, *args, **kwargs):
        self.check_write()
        return super().create(request, *args, **kwargs)


class ResourceDetail(ResourceMixin, generics.RetrieveUpdateDestroyAPIView):
    @transaction.atomic
    def update(self, request, *args, **kwargs):
        self.check_write()
        return super().update(request, *args, **kwargs)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


class StudentListCreateView(ResourceList):
    model, serializer_class = Student, StudentSerializer


class StudentDetailView(ResourceDetail):
    model, serializer_class = Student, StudentSerializer


class TeacherListCreateView(ResourceList):
    model, serializer_class = Teacher, TeacherSerializer


class TeacherDetailView(ResourceDetail):
    model, serializer_class = Teacher, TeacherSerializer


class ClassListCreateView(ResourceList):
    model, serializer_class = SchoolClass, SchoolClassSerializer


class ClassDetailView(ResourceDetail):
    model, serializer_class = SchoolClass, SchoolClassSerializer


class TimetableListCreateView(ResourceList):
    model, serializer_class = TimetableEntry, TimetableEntrySerializer


class TimetableDetailView(ResourceDetail):
    model, serializer_class = TimetableEntry, TimetableEntrySerializer


class AttendanceListCreateView(ResourceList):
    model, serializer_class, admin_write = Attendance, AttendanceSerializer, False

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        payload = request.data.get('records') if isinstance(request.data, dict) and 'records' in request.data else request.data
        if isinstance(request.data, dict) and 'records' in request.data and set(request.data) - {'records', 'expected_revision', 'reason'}:
            raise ValidationError('Only attendance records, revision and correction reason are accepted.')
        if not isinstance(payload, list):
            return super().post(request, *args, **kwargs)
        if not payload or len(payload) > 300:
            raise ValidationError('Submit between 1 and 300 attendance records.')
        School.objects.select_for_update().get(pk=request.school.pk)
        validated, identities = [], set()
        for item in payload:
            serializer = self.get_serializer(data=item)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            identity = (data['student'].pk, data['school_class'].pk, data['attendance_date'])
            if identity in identities:
                raise ValidationError('Each student can appear only once in a batch.')
            identities.add(identity)
            validated.append(data)
        from .attendance import save_register
        expected = request.data.get('expected_revision', 0) if isinstance(request.data, dict) else None
        reason = serializers.CharField(max_length=255, allow_blank=True).run_validation(request.data.get('reason', '')) if isinstance(request.data, dict) else ''
        rows, session = save_register(request, validated, expected, reason)
        audit(request, 'attendance_batch_saved', f'rows:{len(rows)}')
        if isinstance(request.data, dict):
            from .workflow_views import attendance_session_data
            return Response({'detail': 'Attendance saved.', 'session': attendance_session_data(session, request), 'records': self.get_serializer(rows, many=True).data}, status=201)
        return Response(self.get_serializer(rows, many=True).data, status=201)


class AttendanceDetailView(ResourceDetail):
    model, serializer_class, admin_write = Attendance, AttendanceSerializer, False

    def update(self, request, *args, **kwargs):
        self.get_object()  # Preserve scoped 404 for inaccessible identities.
        raise ValidationError('Use the class attendance register to save an audited correction.')

    def destroy(self, request, *args, **kwargs):
        self.get_object()
        raise ValidationError('Attendance is retained. Correct it through the class register.')


class ExamListCreateView(ResourceList):
    model, serializer_class = Exam, ExamSerializer


class ExamDetailView(ResourceDetail):
    model, serializer_class = Exam, ExamSerializer


def exam_students(exam):
    historic_ids = Enrollment.objects.filter(school_class_id=exam.school_class_id, academic_year=exam.academic_year).values_list('student_id', flat=True)
    return Student.objects.filter(Q(pk__in=historic_ids) | Q(school_class_id=exam.school_class_id, is_active=True)).order_by('name')


class ExamRosterView(InputAPIView):
    def get(self, request, pk):
        exam = get_object_or_404(Exam.objects.filter(school_class__in=authorized_classes(request)), pk=pk)
        students = exam_students(exam)
        return Response(StudentSerializer(students, many=True, context={'request': request}).data)


class ResultListCreateView(ResourceList):
    model, serializer_class, admin_write = Result, ResultSerializer, False


class ResultDetailView(ResourceDetail):
    model, serializer_class, admin_write = Result, ResultSerializer, False


class BulkResultsView(InputAPIView):
    allow_list = True
    @transaction.atomic
    def post(self, request):
        if not isinstance(request.data, list) or not request.data or len(request.data) > 300:
            raise ValidationError('Submit between 1 and 300 results.')
        School.objects.select_for_update().get(pk=request.school.pk)
        validated, identities = [], set()
        for item in request.data:
            if not isinstance(item, dict):
                raise ValidationError('Each result must be an object.')
            obj = Result.objects.filter(student_id=identifier(item.get('student')), exam_id=identifier(item.get('exam')), subject=item.get('subject')).first()
            serializer = ResultSerializer(obj, data=item, context={'request': request})
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            identity = (data['student'].pk, data['exam'].pk, data['subject'])
            if identity in identities:
                raise ValidationError('A result appears twice in this submission.')
            identities.add(identity)
            validated.append(serializer)
        rows = [serializer.save(school=request.school) for serializer in validated]
        audit(request, 'results_batch_saved', f'rows:{len(rows)}')
        return Response(ResultSerializer(rows, many=True, context={'request': request}).data)


class FeeListCreateView(ResourceList):
    model, serializer_class = Fee, FeeSerializer


class FeeDetailView(ResourceDetail):
    model, serializer_class = Fee, FeeSerializer


class FeePaymentListCreateView(ResourceList):
    model, serializer_class = FeePayment, FeePaymentSerializer

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        self.check_write()
        get_object_or_404(Fee.objects.select_for_update(), pk=identifier(request.data.get('fee')), is_active=True)
        if request.data.get('request_id'):
            key = serializers.UUIDField().run_validation(request.data['request_id'])
            previous = FeePayment.objects.filter(request_id=key).first()
            if previous:
                amount = serializers.DecimalField(max_digits=12, decimal_places=2).run_validation(request.data.get('amount'))
                day = serializers.DateField().run_validation(request.data.get('payment_date', timezone.localdate()))
                if previous.fee_id != identifier(request.data.get('fee')) or previous.amount != amount or previous.payment_date != day or previous.payment_method != request.data.get('payment_method', 'Cash') or previous.notes != request.data.get('notes', ''):
                    from .attendance import conflict
                    conflict('This payment request was already used for different details. Reopen the payment form.')
                return Response(self.get_serializer(previous).data, status=200)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(school=request.school, recorded_by=request.user)
        audit(request, 'payment_recorded', obj.pk)
        from .notifications import notify
        notify(request.school, f'payment:{obj.pk}', 'Payment recorded', f'{obj.amount} AFN recorded. Receipt {request.school.slug.upper()}-{obj.pk:06d}.', 'fees', exclude_user=request.user.pk, admins_only=True)
        return Response(self.get_serializer(obj).data, status=201)


class HomeworkListCreateView(ResourceList):
    model, serializer_class, admin_write = Homework, HomeworkSerializer, False


class HomeworkDetailView(ResourceDetail):
    model, serializer_class, admin_write = Homework, HomeworkSerializer, False

    def check_write(self):
        super().check_write()
        if not is_admin(self.request) and self.get_object().created_by_id != self.request.user.pk:
            raise PermissionDenied('Only the author or school administrator can edit this homework.')


class AnnouncementListCreateView(ResourceList):
    model, serializer_class = Announcement, AnnouncementSerializer


class AnnouncementDetailView(ResourceDetail):
    model, serializer_class = Announcement, AnnouncementSerializer


class GuardianListView(ResourceList):
    model, serializer_class = Guardian, GuardianSerializer


class GuardianDetailView(ResourceDetail):
    model, serializer_class = Guardian, GuardianSerializer


class EnrollmentListView(ResourceMixin, generics.ListAPIView):
    model, serializer_class = Enrollment, EnrollmentSerializer


def school_settings(request):
    config, _ = SchoolSettings.objects.get_or_create(school=request.school, defaults={'school_name': request.school.name, 'teaching_days': ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'], 'grading_scale': {'A': 90, 'B': 80, 'C': 70, 'D': 60, 'E': 0}})
    return config


class SchoolSettingsView(generics.RetrieveUpdateAPIView):
    permission_classes = [SchoolAdmin]
    serializer_class = SchoolSettingsSerializer

    def get_object(self):
        return school_settings(self.request)

    @transaction.atomic
    def perform_update(self, serializer):
        config = serializer.save()
        school = self.request.school
        school.name, school.logo = config.school_name, config.logo or school.logo
        school.save(update_fields=['name', 'logo'])
        audit(self.request, 'school_branding_updated', school.pk)


class SchoolContextView(InputAPIView):
    def get(self, request):
        return Response({'school': SchoolSerializer(request.school, context={'request': request}).data, 'settings': SchoolSettingsSerializer(school_settings(request), context={'request': request}).data, 'role': request.membership.role})


class TeacherAccountView(InputAPIView):
    permission_classes = [SchoolAdmin]

    def get(self, request, pk):
        teacher = get_object_or_404(Teacher.objects.select_related('user'), pk=pk)
        return Response({'username': teacher.user.username if teacher.user else '', 'email': teacher.user.email if teacher.user else '', 'status': TeacherSerializer(teacher, context={'request': request}).data['account_status'], 'must_change_password': teacher.user.must_change_password if teacher.user else False})

    @transaction.atomic
    def post(self, request, pk):
        teacher = get_object_or_404(Teacher.objects.select_for_update(), pk=pk)
        if teacher.user_id:
            raise ValidationError('An account already exists. Use account status or password reset.')
        username = str(request.data.get('username', '')).strip()
        if not username or User.objects.filter(username=username).exists():
            raise ValidationError({'username': 'Choose a new, unique username.'})
        password = password_value(request.data, 'temporary_password')
        try:
            validate_password(password)
        except DjangoValidationError as exc:
            raise ValidationError({'temporary_password': exc.messages})
        user = User.objects.create_user(username=username, email=request.data.get('email', ''), password=password, must_change_password=True)
        member = Membership.objects.create(user=user, school=request.school, role='teacher', is_active=teacher.status == 'Active')
        teacher.user = user
        teacher.save(update_fields=['user'])
        audit(request, 'teacher_account_created', f'membership:{member.pk}')
        return Response({'teacher': TeacherSerializer(teacher, context={'request': request}).data}, status=201)

    @transaction.atomic
    def patch(self, request, pk):
        if set(request.data) - {'status'}:
            raise ValidationError('Only school account status can be changed here.')
        teacher = get_object_or_404(Teacher.objects, pk=pk)
        member = get_object_or_404(Membership, user_id=teacher.user_id, school=request.school, role='teacher')
        if teacher.user.is_superuser:
            raise PermissionDenied('Platform accounts cannot be changed by school administrators.')
        if request.data.get('status') not in ['Active', 'Inactive']:
            raise ValidationError('Choose Active or Inactive.')
        member.is_active = request.data['status'] == 'Active'
        member.version += 1
        member.save()
        audit(request, 'membership_status_changed', member.pk)
        return self.get(request, pk)


class TeacherAccountResetPasswordView(InputAPIView):
    permission_classes = [SchoolAdmin]

    @transaction.atomic
    def post(self, request, pk):
        teacher = get_object_or_404(Teacher.objects.select_related('user'), pk=pk)
        if not teacher.user_id or teacher.user.is_superuser or Membership.objects.filter(user=teacher.user).exclude(school=request.school).exists():
            raise PermissionDenied('Shared or platform accounts require a platform administrator to reset their password.')
        password = password_value(request.data, 'temporary_password')
        try:
            validate_password(password, teacher.user)
        except DjangoValidationError as exc:
            raise ValidationError({'temporary_password': exc.messages})
        user = User.objects.select_for_update().get(pk=teacher.user_id)
        user.set_password(password)
        user.must_change_password = True
        user.session_version += 1
        user.save(update_fields=['password', 'must_change_password', 'session_version'])
        audit(request, 'teacher_password_reset', teacher.pk)
        return Response({'detail': 'Temporary password set. Existing sessions have ended.'})


class PromotionView(InputAPIView):
    permission_classes = [SchoolAdmin]

    @transaction.atomic
    def post(self, request):
        source = get_object_or_404(SchoolClass.objects.select_for_update(), pk=identifier(request.data.get('from_class')))
        destination = get_object_or_404(SchoolClass.objects.select_for_update(), pk=identifier(request.data.get('to_class')), status='Active')
        if source.pk == destination.pk:
            raise ValidationError('Choose a different destination class.')
        year = destination.academic_year or school_settings(request).academic_year
        ids = request.data.get('students')
        if isinstance(ids, list):
            ids = [identifier(value) for value in ids]
        if not isinstance(ids, list) or not ids or len(ids) > 300 or len(set(ids)) != len(ids):
            raise ValidationError('Select between 1 and 300 students.')
        students = list(Student.objects.select_for_update().filter(pk__in=ids, school_class=source, is_active=True))
        if len(students) != len(ids):
            raise ValidationError('Every selected student must be active in the source class.')
        for student in students:
            Enrollment.objects.get_or_create(student=student, school_class=source, academic_year=source.academic_year or school_settings(request).academic_year)
            Enrollment.objects.filter(student=student, ended_at__isnull=True).update(ended_at=timezone.localdate())
            Enrollment.objects.get_or_create(student=student, school_class=destination, academic_year=year, defaults={'enrolled_at': timezone.localdate()})
            student.school_class = destination
            student.save(update_fields=['school_class'])
        audit(request, 'students_promoted', f'{source.pk}:{destination.pk}:count:{len(students)}')
        return Response({'promoted': len(students)})


def attendance_summary(queryset):
    counts = {key.lower(): queryset.filter(status=key).count() for key in ['Present', 'Absent', 'Late']}
    return {**counts, 'total': queryset.count()}


def attendance_expected(students, records):
    # Include pupils marked before a same-day promotion/archive in the day's roster.
    return students.values_list('pk', flat=True).union(records.values_list('student_id', flat=True)).count()


class DashboardSummaryView(InputAPIView):
    permission_classes = [SchoolAdmin]

    def get(self, request):
        records = Attendance.objects.filter(attendance_date=timezone.localdate())
        classes = SchoolClass.objects.filter(status='Active')
        fees = Fee.objects.filter(is_active=True)
        return Response({'student_count': Student.objects.filter(is_active=True).count(), 'teacher_count': Teacher.objects.filter(status='Active').count(), 'class_count': classes.count(),
            'pending_fees': fees.filter(remaining_amount__gt=0).values('student_id').distinct().count(),
            'outstanding_balance': fees.aggregate(total=Sum('remaining_amount'))['total'] or 0,
            'today_attendance': {**attendance_summary(records), 'by_class': [{'class_id': c.pk, 'class_name': c.name, **attendance_summary(records.filter(school_class=c)), 'expected': attendance_expected(c.students.filter(is_active=True), records.filter(school_class=c))} for c in classes]},
            'announcement_count': Announcement.objects.count(), 'latest_announcements': AnnouncementSerializer(Announcement.objects.filter(status='Published').order_by('-created_at')[:3], many=True, context={'request': request}).data})


class TeacherDashboardView(InputAPIView):
    def get(self, request):
        if is_admin(request):
            raise PermissionDenied('Teacher access required.')
        teacher = teacher_for(request)
        classes = authorized_classes(request)
        students = Student.objects.filter(school_class__in=classes, is_active=True)
        records = Attendance.objects.filter(school_class__in=classes, attendance_date=timezone.localdate())
        today_timetable = TimetableEntry.objects.filter(teacher=teacher, day=timezone.localdate().strftime('%A')).select_related('school_class').order_by('start_time')
        exams = Exam.objects.filter(school_class__in=classes).select_related('school_class').order_by('-exam_date')
        pending = []
        for exam in exams:
            for subject in set(exam.subjects or [exam.subject]) & authorized_subjects(request, exam.school_class_id):
                roster = exam_students(exam)
                total = roster.count()
                completed = Result.objects.filter(exam=exam, subject=subject, student__in=roster).count()
                if completed < total:
                    pending.append({'exam_id': exam.pk, 'exam_name': exam.name, 'class_name': exam.school_class.name, 'subject': subject, 'completed': completed, 'total': total})
        return Response({'teacher_name': teacher.name, 'subject': teacher.subject, 'assigned_classes': list(classes.values_list('name', flat=True)), 'assigned_class_ids': list(classes.values_list('pk', flat=True)),
            'assigned_classes_detail': [{'id': c.pk, 'name': c.name, 'grade': c.grade, 'academic_year': c.academic_year, 'subjects': list(authorized_subjects(request, c.pk)), 'student_count': c.students.filter(is_active=True).count(), 'attendance_marked': records.filter(school_class=c).count(), 'attendance_total': attendance_expected(c.students.filter(is_active=True), records.filter(school_class=c))} for c in classes],
            'assigned_subjects': list({teacher.subject, *TimetableEntry.objects.filter(teacher=teacher).values_list('subject', flat=True)}),
            'student_count': students.count(), 'attendance_summary': {**attendance_summary(records), 'marked_today': records.count(), 'total_students': attendance_expected(students, records)}, 'pending_results': pending, 'pending_result_count': len(pending),
            'today_timetable': [{'id': t.pk, 'day': t.day, 'subject': t.subject, 'start_time': t.start_time, 'end_time': t.end_time, 'school_class_id': t.school_class_id, 'school_class': t.school_class.name, 'teacher_id': t.teacher_id} for t in today_timetable],
            'upcoming_homework': HomeworkSerializer(Homework.objects.filter(school_class__in=classes, due_date__gte=timezone.localdate()).order_by('due_date')[:5], many=True, context={'request': request}).data})


class ReportsSummaryView(InputAPIView):
    permission_classes = [SchoolAdmin]

    def get(self, request):
        mode = request.query_params.get('report', 'summary')
        class_id = request.query_params.get('class')
        student_id = request.query_params.get('student')
        if class_id and (not class_id.isdigit() or not SchoolClass.objects.filter(pk=class_id).exists()):
            raise ValidationError('Choose a class in this school.')
        if student_id and (not student_id.isdigit() or not Student.objects.filter(pk=student_id).exists()):
            raise ValidationError('Choose a student in this school.')
        if mode == 'summary':
            fees = Fee.objects.filter(is_active=True)
            records = Attendance.objects.all()
            data = {'student_count': Student.objects.filter(is_active=True).count(), 'teacher_count': Teacher.objects.filter(status='Active').count(), 'class_count': SchoolClass.objects.filter(status='Active').count(),
                    'attendance_rate': round(records.filter(status='Present').count() / records.count() * 100, 2) if records.exists() else 0,
                    'fee_summary': {'paid': fees.aggregate(total=Sum('paid_amount'))['total'] or 0, 'pending': fees.aggregate(total=Sum('remaining_amount'))['total'] or 0, 'partially_paid': fees.filter(status='Partially Paid').aggregate(total=Sum('paid_amount'))['total'] or 0},
                    'class_summary': [{'name': c.name, 'student_count': c.students.filter(is_active=True).count()} for c in SchoolClass.objects.all()], 'result_count': Result.objects.count()}
            return Response(data)
        if mode == 'students':
            qs = Student.objects.select_related('school_class').order_by('name')
            if class_id: qs = qs.filter(school_class_id=class_id)
            if request.query_params.get('gender'): qs = qs.filter(gender=request.query_params['gender'])
            if request.query_params.get('status') in ['Active', 'Inactive']: qs = qs.filter(is_active=request.query_params['status'] == 'Active')
            rows = [{'student_id': s.student_id, 'name': s.name, 'father_name': s.father_name, 'class_name': s.school_class.name, 'contact_number': s.contact_number, 'gender': s.gender, 'status': 'Active' if s.is_active else 'Inactive'} for s in qs]
        elif mode == 'attendance':
            qs = Attendance.objects.select_related('student', 'school_class').order_by('-attendance_date')
            if class_id: qs = qs.filter(school_class_id=class_id)
            if student_id: qs = qs.filter(student_id=student_id)
            for key, field in [('from', 'attendance_date__gte'), ('to', 'attendance_date__lte')]:
                if request.query_params.get(key):
                    from django.utils.dateparse import parse_date
                    value = parse_date(request.query_params[key])
                    if not value: raise ValidationError('Choose a valid date range.')
                    qs = qs.filter(**{field: value})
            if request.query_params.get('status'): qs = qs.filter(status=request.query_params['status'])
            rows = [{'date': r.attendance_date, 'student_id': r.student.student_id, 'student_name': r.student.name, 'class_name': r.school_class.name, 'status': r.status} for r in qs]
        elif mode == 'fees':
            qs = Fee.objects.filter(is_active=True).select_related('student', 'school_class')
            if class_id: qs = qs.filter(school_class_id=class_id)
            if student_id: qs = qs.filter(student_id=student_id)
            if request.query_params.get('status'): qs = qs.filter(status=request.query_params['status'])
            rows = [{'student_id': f.student.student_id, 'student_name': f.student.name, 'class_name': f.school_class.name, 'fee_type': f.fee_type, 'total_due': f.total_due, 'paid': f.paid_amount, 'remaining': f.remaining_amount, 'due_date': f.due_date, 'status': f.status} for f in qs]
        elif mode == 'results':
            qs = Result.objects.select_related('student', 'exam', 'exam__school_class')
            if class_id: qs = qs.filter(exam__school_class_id=class_id)
            if student_id: qs = qs.filter(student_id=student_id)
            if request.query_params.get('exam'): qs = qs.filter(exam_id=get_object_or_404(Exam.objects, pk=identifier(request.query_params['exam'])).pk)
            if request.query_params.get('subject'): qs = qs.filter(subject=request.query_params['subject'])
            rows = [{'student_id': r.student.student_id, 'student_name': r.student.name, 'exam_name': r.exam.name, 'class_name': r.exam.school_class.name, 'subject': r.subject, 'marks': r.marks, 'maximum': r.total_marks, 'percentage': r.percentage, 'grade': r.grade} for r in qs]
        elif mode == 'teachers':
            qs = Teacher.objects.prefetch_related('assigned_classes')
            if class_id: qs = qs.filter(assigned_classes__pk=class_id)
            if request.query_params.get('status'): qs = qs.filter(status=request.query_params['status'])
            rows = [{'name': t.name, 'subject': t.subject, 'classes': list(t.assigned_classes.values_list('name', flat=True)), 'status': t.status} for t in qs]
        else:
            raise ValidationError('Choose a supported report.')
        audit(request, 'report_generated', mode)
        if request.query_params.get('format') == 'csv':
            stream = StringIO()
            columns = list(rows[0]) if rows else []
            writer = csv.DictWriter(stream, fieldnames=columns)
            writer.writeheader()
            for row in rows:
                writer.writerow({k: "'" + str(v) if str(v).lstrip().startswith(('=', '+', '-', '@')) else v for k, v in row.items()})
            response = HttpResponse(stream.getvalue(), content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = f'attachment; filename="{request.school.slug}-{mode}.csv"'
            response['Cache-Control'] = 'private, no-store'
            return response
        return Response(rows)


class FollowUpView(InputAPIView):
    permission_classes = [SchoolAdmin]

    def get(self, request):
        absences = Attendance.objects.filter(status='Absent', attendance_date=timezone.localdate()).select_related('student')
        overdue = Fee.objects.filter(is_active=True, remaining_amount__gt=0, due_date__lt=timezone.localdate())
        return Response({'absent_today': [{'student': a.student_id, 'name': a.student.name, 'phone': a.student.contact_number} for a in absences],
                         'overdue_fees': FeeSerializer(overdue, many=True, context={'request': request}).data})


class SchoolAuditView(InputAPIView):
    permission_classes = [SchoolAdmin]

    def get(self, request):
        return Response(list(AuditEvent.objects.filter(school=request.school).order_by('-created_at').values('id', 'actor__username', 'action', 'target', 'created_at')[:100]))


class ReportCardView(InputAPIView):
    def get(self, request, pk):
        student = get_object_or_404(Student.objects.filter(school_class__in=authorized_classes(request)), pk=pk)
        qs = Result.objects.filter(student=student).select_related('exam', 'exam__school_class').order_by('exam__exam_date', 'subject')
        if request.query_params.get('academic_year'):
            qs = qs.filter(exam__academic_year=request.query_params['academic_year'])
        audit(request, 'report_card_viewed', student.pk)
        return Response({'school': SchoolSerializer(request.school, context={'request': request}).data, 'student': StudentSerializer(student, context={'request': request}).data, 'results': ResultSerializer(qs, many=True, context={'request': request}).data})


class ReceiptView(InputAPIView):
    permission_classes = [SchoolAdmin]

    def get(self, request, pk):
        payment = get_object_or_404(FeePayment.objects.select_related('fee__student', 'recorded_by'), pk=pk)
        audit(request, 'receipt_viewed', payment.pk)
        return Response({'receipt_number': f'{request.school.slug.upper()}-{payment.pk:07d}', 'school': SchoolSerializer(request.school, context={'request': request}).data,
                         'student': payment.fee.student.name, 'student_id': payment.fee.student.student_id, 'fee_type': payment.fee.fee_type,
                         'payment': FeePaymentSerializer(payment, context={'request': request}).data, 'remaining': payment.fee.remaining_amount, 'recorded_by': payment.recorded_by.username if payment.recorded_by else ''})
