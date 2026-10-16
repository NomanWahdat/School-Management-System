from decimal import Decimal
import re
import math
from PIL import Image, UnidentifiedImageError

from django.utils import timezone
from rest_framework import serializers

from .models import (School, Membership, User, SchoolClass, Student, Teacher, Attendance, Exam,
                     Result, Fee, FeePayment, Homework, Announcement, SchoolSettings,
                     TimetableEntry, Guardian, Enrollment)
from .permissions import is_admin, authorized_classes, authorized_subjects
from .tenancy import school_id


def validate_logo(file):
    if file is None or isinstance(file, str):
        return file
    if file.size > 2 * 1024 * 1024:
        raise serializers.ValidationError('Logo must be smaller than 2 MB.')
    header = file.read(16)
    file.seek(0)
    valid = header.startswith(b'\x89PNG\r\n\x1a\n') or header.startswith(b'\xff\xd8\xff') or (header[:4] == b'RIFF' and header[8:12] == b'WEBP')
    if not valid or not file.name.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
        raise serializers.ValidationError('Choose a PNG, JPEG, or WebP image.')
    try:
        with Image.open(file) as logo:
            if logo.format not in ('PNG', 'JPEG', 'WEBP') or logo.width > 4096 or logo.height > 4096:
                raise serializers.ValidationError('Choose a logo smaller than 4096 by 4096 pixels.')
            file.content_type = Image.MIME[logo.format]
            logo.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
        raise serializers.ValidationError('This image is damaged. Choose another PNG, JPEG, or WebP logo.')
    finally:
        file.seek(0)
    return file


class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = School
        fields = ['id', 'name', 'slug', 'is_active', 'logo', 'appearance', 'created_at']
        read_only_fields = ['id', 'created_at']

    validate_logo = staticmethod(validate_logo)

    def update(self, instance, validated_data):
        if 'appearance' in validated_data:
            validated_data['appearance'] = {**instance.appearance, **validated_data['appearance']}
        return super().update(instance, validated_data)

    def validate_appearance(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('Appearance must be an object.')
        if set(value) - {'accent'}:
            raise serializers.ValidationError('Only the accent color can be customized.')
        if 'accent' in value and not re.fullmatch(r'#[0-9a-fA-F]{6}', str(value['accent'])):
            raise serializers.ValidationError('Use a six-digit hex color.')
        return value


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    is_platform_admin = serializers.BooleanField(source='is_superuser', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name', 'role', 'must_change_password', 'is_platform_admin']
        read_only_fields = ['username', 'email', 'role', 'must_change_password']

    def get_role(self, obj):
        request = self.context.get('request')
        membership = getattr(request, 'membership', None)
        if not membership and request and getattr(request, 'auth', None) is not None:
            membership = Membership.objects.filter(user=obj, school_id=request.auth.get('school_id'), is_active=True, school__is_active=True).first()
        return membership.role if membership else None


class ScopedSerializer(serializers.ModelSerializer):
    """Scope all FK/M2M choices dynamically after authentication, and reject ownership input."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if 'request' not in self.context:
            return  # Read-only nested declarations are constructed at module import.
        for field in self.fields.values():
            relation = field.child_relation if isinstance(field, serializers.ManyRelatedField) else field
            if isinstance(relation, serializers.PrimaryKeyRelatedField) and relation.queryset is not None:
                model = relation.queryset.model
                if hasattr(model, 'all_objects'):
                    relation.queryset = model.objects.all()

    def validate(self, attrs):
        incoming = getattr(self, 'initial_data', {})
        if any(key in incoming for key in ['school', 'school_id']):
            raise serializers.ValidationError({'school': 'School ownership is assigned by the server.'})
        return attrs


class SchoolClassSerializer(ScopedSerializer):
    student_count = serializers.SerializerMethodField()
    teacher_count = serializers.SerializerMethodField()
    available_subjects = serializers.SerializerMethodField()

    class Meta:
        model = SchoolClass
        fields = ['id', 'name', 'grade', 'section', 'academic_year', 'subjects', 'status', 'student_count', 'teacher_count', 'available_subjects', 'created_at']

    def validate_grade(self, value):
        value = str(value).removeprefix('Grade ').removeprefix('Class ').strip()
        if not str(value).isdigit() or not 1 <= int(value) <= 12:
            raise serializers.ValidationError('Choose a grade from 1 to 12.')
        return str(int(value))

    def validate_section(self, value):
        return value.strip().upper()

    def validate_subjects(self, value):
        if not isinstance(value, list) or not all(isinstance(x, str) and x.strip() for x in value):
            raise serializers.ValidationError('Enter a list of subject names.')
        return list(dict.fromkeys(x.strip() for x in value))

    def get_student_count(self, obj):
        return obj.students.filter(is_active=True).count()

    def get_teacher_count(self, obj):
        return obj.teacher_set.filter(status='Active').count()

    def get_available_subjects(self, obj):
        return list(dict.fromkeys((obj.subjects or []) + list(obj.teacher_set.filter(status='Active').values_list('subject', flat=True))))

    def validate(self, attrs):
        attrs = super().validate(attrs)
        values = {key: attrs.get(key, getattr(self.instance, key, None)) for key in ['name', 'grade', 'academic_year']}
        section = attrs.get('section', getattr(self.instance, 'section', ''))
        if values['grade'] and not self.instance and not attrs.get('subjects'):
            from .curriculum import subjects_for_grade
            attrs['subjects'] = subjects_for_grade(values['grade'])
        if section and SchoolClass.objects.filter(grade=values['grade'], section=section, academic_year=values['academic_year']).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError('This grade and section already exist for the academic year.')
        if SchoolClass.objects.filter(**values).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError('A class with these details already exists.')
        return attrs


class StudentSerializer(ScopedSerializer):
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    fee_status = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = ['id', 'student_id', 'name', 'father_name', 'gender', 'date_of_birth', 'school_class', 'school_class_name', 'contact_number', 'address', 'admission_date', 'fee_status', 'is_active']
        read_only_fields = ['fee_status', 'admission_date']

    def get_fee_status(self, obj):
        fees = [fee for fee in obj.fees.all() if fee.is_active]
        remaining = sum((fee.remaining_amount for fee in fees), Decimal('0.00'))
        paid = sum((fee.paid_amount for fee in fees), Decimal('0.00'))
        return 'Paid' if remaining == 0 else 'Partially Paid' if paid > 0 else 'Pending'

    def validate_date_of_birth(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError('Date of birth cannot be in the future.')
        return value

    def validate_school_class(self, value):
        if value.status != 'Active':
            raise serializers.ValidationError('Choose an active class.')
        if self.instance and value.pk != self.instance.school_class_id:
            raise serializers.ValidationError('Use class promotion to preserve enrollment history.')
        return value

    def validate_student_id(self, value):
        if Student.objects.filter(student_id=value).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError('A student with this ID already exists in this school.')
        return value


class TeacherSerializer(ScopedSerializer):
    assigned_class_names = serializers.SerializerMethodField()
    account_username = serializers.CharField(source='user.username', read_only=True, default='')
    account_email = serializers.CharField(source='user.email', read_only=True, default='')
    account_status = serializers.SerializerMethodField()

    class Meta:
        model = Teacher
        fields = ['id', 'teacher_id', 'user', 'name', 'phone_number', 'subject', 'assigned_classes', 'assigned_class_names', 'status', 'account_username', 'account_email', 'account_status']
        read_only_fields = ['user']

    def validate_teacher_id(self, value):
        if Teacher.objects.filter(teacher_id=value).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError('A teacher with this ID already exists in this school.')
        return value

    def validate_assigned_classes(self, values):
        if any(value.status != 'Active' for value in values):
            raise serializers.ValidationError('Choose active classes only.')
        return values

    def get_assigned_class_names(self, obj):
        return list(obj.assigned_classes.values_list('name', flat=True))

    def get_account_status(self, obj):
        if not obj.user_id:
            return 'Not created'
        return 'Active' if Membership.objects.filter(user_id=obj.user_id, school_id=obj.school_id, is_active=True).exists() else 'Inactive'


class AttendanceSerializer(ScopedSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    recorded_by_name = serializers.CharField(source='recorded_by.username', read_only=True, default='')

    class Meta:
        model = Attendance
        fields = ['id', 'student', 'student_name', 'school_class', 'school_class_name', 'attendance_date', 'status', 'remarks', 'recorded_by', 'recorded_by_name']
        read_only_fields = ['recorded_by']
        validators = []  # Batch upsert validates identity in the view, under a transaction.

    def validate(self, attrs):
        attrs = super().validate(attrs)
        student = attrs.get('student', getattr(self.instance, 'student', None))
        school_class = attrs.get('school_class', getattr(self.instance, 'school_class', None)) or student.school_class
        if self.instance and (student.pk != self.instance.student_id or school_class.pk != self.instance.school_class_id):
            raise serializers.ValidationError('The student and class of saved attendance cannot be changed.')
        if not self.instance and (not student.is_active or student.school_class_id != school_class.pk):
            raise serializers.ValidationError('Student must be active and enrolled in the selected class.')
        request = self.context['request']
        if not authorized_classes(request).filter(pk=school_class.pk).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You are not assigned to this class.')
        if attrs.get('attendance_date', getattr(self.instance, 'attendance_date', timezone.localdate())) > timezone.localdate():
            raise serializers.ValidationError('Attendance cannot be recorded for a future date.')
        attrs['school_class'] = school_class
        return attrs


class ExamSerializer(ScopedSerializer):
    class Meta:
        model = Exam
        exclude = ['school']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        school_class = attrs.get('school_class', getattr(self.instance, 'school_class', None))
        subjects = attrs.get('subjects', getattr(self.instance, 'subjects', None)) or [attrs.get('subject', getattr(self.instance, 'subject', ''))]
        if not isinstance(subjects, list) or not subjects or not all(isinstance(x, str) and x.strip() for x in subjects):
            raise serializers.ValidationError({'subjects': 'Choose at least one subject.'})
        configured = set(school_class.subjects or []) | set(school_class.teacher_set.filter(status='Active').values_list('subject', flat=True))
        if configured and not set(subjects).issubset(configured):
            raise serializers.ValidationError({'subjects': 'Choose subjects assigned to this class.'})
        attrs['subjects'] = list(dict.fromkeys(subjects))
        attrs['subject'] = subjects[0]
        if attrs.get('max_marks', getattr(self.instance, 'max_marks', 100)) <= 0 or not math.isfinite(attrs.get('max_marks', getattr(self.instance, 'max_marks', 100))):
            raise serializers.ValidationError({'max_marks': 'Maximum marks must be greater than zero.'})
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'End date must be on or after start date.'})
        if self.instance and self.instance.results.exists() and (school_class.pk != self.instance.school_class_id or subjects != (self.instance.subjects or [self.instance.subject]) or attrs.get('max_marks', self.instance.max_marks) != self.instance.max_marks):
            raise serializers.ValidationError('Class, subjects, and maximum marks cannot change after results are recorded.')
        return attrs


class ResultSerializer(ScopedSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    exam_name = serializers.CharField(source='exam.name', read_only=True)

    class Meta:
        model = Result
        fields = ['id', 'student', 'student_name', 'exam', 'exam_name', 'subject', 'marks', 'total_marks', 'percentage', 'grade', 'status']
        read_only_fields = ['percentage', 'grade']
        validators = []

    def validate(self, attrs):
        attrs = super().validate(attrs)
        student = attrs.get('student', getattr(self.instance, 'student', None))
        exam = attrs.get('exam', getattr(self.instance, 'exam', None))
        subject = attrs.get('subject', getattr(self.instance, 'subject', '')) or exam.subject
        maximum = attrs.get('total_marks', getattr(self.instance, 'total_marks', exam.max_marks))
        marks = attrs.get('marks', getattr(self.instance, 'marks', 0))
        if self.instance and (student.pk != self.instance.student_id or exam.pk != self.instance.exam_id or subject != self.instance.subject):
            raise serializers.ValidationError('Saved result identity cannot be changed.')
        enrolled = student.school_class_id == exam.school_class_id or Enrollment.objects.filter(student=student, school_class_id=exam.school_class_id, academic_year=exam.academic_year).exists()
        if not enrolled or subject not in (exam.subjects or [exam.subject]):
            raise serializers.ValidationError('Student or subject does not belong to this examination.')
        request = self.context['request']
        if not authorized_classes(request).filter(pk=exam.school_class_id).exists() or (not is_admin(request) and subject not in authorized_subjects(request, exam.school_class_id)):
            raise serializers.ValidationError('You are not assigned to this class and subject.')
        if not math.isfinite(maximum) or not math.isfinite(marks) or maximum <= 0 or maximum != exam.max_marks or marks < 0 or marks > maximum:
            raise serializers.ValidationError({'marks': f'Use marks between 0 and the exam maximum ({exam.max_marks:g}).'})
        if Result.objects.filter(student=student, exam=exam, subject=subject).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError('A result for this student, exam, and subject already exists.')
        percentage = round(marks / maximum * 100, 2)
        settings = SchoolSettings.objects.filter(school_id=school_id()).first()
        scale = settings.grading_scale if settings and settings.grading_scale else {'A': 90, 'B': 80, 'C': 70, 'D': 60, 'E': 0}
        attrs.update(subject=subject, total_marks=maximum, percentage=percentage, grade=next((grade for grade, threshold in sorted(scale.items(), key=lambda x: x[1], reverse=True) if percentage >= threshold), 'E'))
        return attrs


class FeePaymentSerializer(ScopedSerializer):
    class Meta:
        model = FeePayment
        fields = ['id', 'fee', 'amount', 'payment_date', 'payment_method', 'notes', 'recorded_by', 'request_id']
        read_only_fields = ['recorded_by']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs['fee'].is_active or attrs['amount'] <= Decimal('0') or attrs['amount'] > attrs['fee'].remaining_amount:
            raise serializers.ValidationError({'amount': 'Payment must be positive and cannot exceed the outstanding balance.'})
        if attrs.get('payment_date', timezone.localdate()) > timezone.localdate():
            raise serializers.ValidationError({'payment_date': 'Payment date cannot be in the future.'})
        return attrs


class FeeSerializer(ScopedSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    student_number = serializers.CharField(source='student.student_id', read_only=True)
    class_name = serializers.CharField(source='school_class.name', read_only=True)
    payments = FeePaymentSerializer(many=True, read_only=True)

    class Meta:
        model = Fee
        exclude = ['school']
        read_only_fields = ['paid_amount', 'remaining_amount', 'status', 'created_by', 'created_at', 'payment_date']

    def validate_billing_period(self, value):
        import re
        if value and not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', value):
            raise serializers.ValidationError('Use YYYY-MM for the billing month.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        student = attrs.get('student', getattr(self.instance, 'student', None))
        school_class = attrs.get('school_class', getattr(self.instance, 'school_class', None)) or student.school_class
        if not self.instance and student.school_class_id != school_class.pk:
            raise serializers.ValidationError('Student must belong to the selected class.')
        if self.instance and student.pk != self.instance.student_id:
            raise serializers.ValidationError('A fee cannot be moved to another student.')
        if self.instance and school_class.pk != self.instance.school_class_id:
            raise serializers.ValidationError('The original class of an invoice must be preserved.')
        total = attrs.get('total_due', getattr(self.instance, 'total_due', None))
        amount = attrs.get('amount', getattr(self.instance, 'amount', Decimal('0')))
        total = total if total is not None else amount
        if amount <= 0 or total <= 0 or amount > total or (self.instance and total < self.instance.paid_amount):
            raise serializers.ValidationError('Total due must be positive and at least the amount already paid.')
        if not attrs.get('due_date', getattr(self.instance, 'due_date', None)):
            raise serializers.ValidationError({'due_date': 'Choose a due date.'})
        if self.instance and self.instance.payments.exists() and attrs.get('is_active') is False:
            raise serializers.ValidationError('An invoice with payments cannot be archived.')
        period = attrs.get('billing_period', getattr(self.instance, 'billing_period', ''))
        fee_type = attrs.get('fee_type', getattr(self.instance, 'fee_type', 'Monthly Tuition Fee'))
        if period and Fee.objects.filter(student=student, fee_type=fee_type, billing_period=period, is_active=True).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError('An invoice already exists for this student, fee type and month.')
        attrs.update(school_class=school_class, total_due=total)
        return attrs


class HomeworkSerializer(ScopedSerializer):
    class Meta:
        model = Homework
        exclude = ['school']
        read_only_fields = ['created_by', 'created_at']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context['request']
        school_class = attrs.get('school_class', getattr(self.instance, 'school_class', None))
        subject = attrs.get('subject', getattr(self.instance, 'subject', ''))
        if not authorized_classes(request).filter(pk=school_class.pk).exists() or (not is_admin(request) and subject not in authorized_subjects(request, school_class.pk)):
            raise serializers.ValidationError('Choose an assigned class and subject.')
        return attrs


class AnnouncementSerializer(ScopedSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    school_class_name = serializers.CharField(source='school_class.name', read_only=True, default='')
    effective_status = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        exclude = ['school']
        read_only_fields = ['created_by', 'created_at']

    def get_effective_status(self, obj):
        now = timezone.now()
        return 'Expired' if obj.expires_at and obj.expires_at <= now else 'Scheduled' if obj.status == 'Published' and obj.publish_at and obj.publish_at > now else obj.status

    def validate(self, attrs):
        attrs = super().validate(attrs)
        audience = attrs.get('audience', getattr(self.instance, 'audience', 'Everyone'))
        if audience == 'Class' and not attrs.get('school_class', getattr(self.instance, 'school_class', None)):
            raise serializers.ValidationError({'school_class': 'Choose a class for this announcement.'})
        if audience != 'Class':
            attrs['school_class'] = None
        start = attrs.get('publish_at', getattr(self.instance, 'publish_at', None))
        end = attrs.get('expires_at', getattr(self.instance, 'expires_at', None))
        if start and end and end <= start:
            raise serializers.ValidationError({'expires_at': 'Expiry must be after publication.'})
        return attrs


class TimetableEntrySerializer(ScopedSerializer):
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    class Meta:
        model = TimetableEntry
        exclude = ['school']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        values = {key: attrs.get(key, getattr(self.instance, key, None)) for key in ['day', 'start_time', 'end_time', 'school_class', 'teacher']}
        if values['end_time'] <= values['start_time']:
            raise serializers.ValidationError('End time must be after start time.')
        if values['day'] not in ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']:
            raise serializers.ValidationError({'day': 'Choose a valid teaching day.'})
        config = SchoolSettings.objects.first()
        if config and config.teaching_days and values['day'] not in config.teaching_days:
            raise serializers.ValidationError({'day': 'This day is not in the school teaching week.'})
        if values['teacher'].status != 'Active' or not values['teacher'].assigned_classes.filter(pk=values['school_class'].pk).exists():
            raise serializers.ValidationError('Teacher must be active and assigned to this class.')
        from django.db.models import Q
        conflict = TimetableEntry.objects.filter(day=values['day'], start_time__lt=values['end_time'], end_time__gt=values['start_time']).filter(Q(teacher=values['teacher']) | Q(school_class=values['school_class'])).exclude(pk=getattr(self.instance, 'pk', None))
        if conflict.exists():
            raise serializers.ValidationError('Schedule conflict: this teacher or class already has a lesson at that time.')
        return attrs


class GuardianSerializer(ScopedSerializer):
    class Meta:
        model = Guardian
        exclude = ['school']


class EnrollmentSerializer(ScopedSerializer):
    class_name = serializers.CharField(source='school_class.name', read_only=True)

    class Meta:
        model = Enrollment
        exclude = ['school']


class SchoolSettingsSerializer(ScopedSerializer):
    appearance = serializers.JSONField(required=False, write_only=True)
    class Meta:
        model = SchoolSettings
        exclude = ['school']
        read_only_fields = ['id', 'updated_at']

    validate_logo = staticmethod(validate_logo)

    def validate_appearance(self, value):
        return SchoolSerializer().validate_appearance(value)

    def update(self, instance, validated_data):
        appearance = validated_data.pop('appearance', None)
        config = super().update(instance, validated_data)
        if appearance is not None:
            school = self.context['request'].school
            school.appearance = {**school.appearance, **appearance}
            school.save(update_fields=['appearance'])
        return config

    def validate_teaching_days(self, value):
        days = {'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'}
        if not isinstance(value, list) or any(x not in days for x in value):
            raise serializers.ValidationError('Choose valid teaching days.')
        return list(dict.fromkeys(value))

    def validate_grading_scale(self, value):
        if not isinstance(value, dict) or not value or len(value) > 10 or any(not isinstance(k, str) or len(k) > 10 or isinstance(v, bool) or not isinstance(v, (int, float)) or not 0 <= v <= 100 for k, v in value.items()) or 0 not in value.values():
            raise serializers.ValidationError('Use grade labels with thresholds from 0 to 100, including a zero threshold.')
        return value
