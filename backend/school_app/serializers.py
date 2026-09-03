from rest_framework import serializers
from django.utils import timezone

from .models import (
    Announcement,
    Attendance,
    Exam,
    Fee,
    FeePayment,
    Homework,
    Result,
    SchoolClass,
    Student,
    Teacher,
    TimetableEntry,
    User,
    SchoolSettings,
)


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source='get_full_name', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name', 'role', 'must_change_password', 'is_active', 'last_login']
        read_only_fields = ['id', 'full_name', 'role', 'must_change_password', 'is_active', 'last_login']


class SchoolClassSerializer(serializers.ModelSerializer):
    student_count = serializers.SerializerMethodField()
    teacher_count = serializers.SerializerMethodField()
    available_subjects = serializers.SerializerMethodField()

    class Meta:
        model = SchoolClass
        fields = ['id', 'name', 'grade', 'academic_year', 'subjects', 'available_subjects', 'status', 'student_count', 'teacher_count', 'created_at']

    def get_student_count(self, obj):
        return obj.students.filter(is_active=True).count()

    def get_teacher_count(self, obj):
        return obj.teacher_set.filter(status='Active').count()

    def get_available_subjects(self, obj):
        configured = [str(subject).strip() for subject in (obj.subjects or []) if str(subject).strip()]
        derived = list(obj.teacher_set.filter(status='Active').values_list('subject', flat=True))
        derived.extend(obj.timetableentry_set.values_list('subject', flat=True))
        return list(dict.fromkeys(configured + [str(subject).strip() for subject in derived if str(subject).strip()]))


class StudentSerializer(serializers.ModelSerializer):
    school_class_name = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            'id', 'student_id', 'name', 'father_name', 'gender', 'date_of_birth',
            'school_class', 'school_class_name', 'contact_number', 'address',
            'admission_date', 'fee_status', 'is_active'
        ]
        read_only_fields = ['school_class_name']

    def get_school_class_name(self, obj):
        return obj.school_class.name if obj.school_class else ''


class TeacherSerializer(serializers.ModelSerializer):
    assigned_class_names = serializers.SerializerMethodField()
    account_username = serializers.SerializerMethodField()
    account_email = serializers.SerializerMethodField()
    account_status = serializers.SerializerMethodField()

    class Meta:
        model = Teacher
        fields = [
            'id', 'teacher_id', 'user', 'name', 'phone_number', 'subject',
            'assigned_classes', 'assigned_class_names', 'status'
            , 'account_username', 'account_email', 'account_status'
        ]
        read_only_fields = ['assigned_class_names']

    def get_assigned_class_names(self, obj):
        return [class_item.name for class_item in obj.assigned_classes.all()]

    def get_account_username(self, obj):
        return obj.user.username if obj.user else ''

    def get_account_email(self, obj):
        return obj.user.email if obj.user else ''

    def get_account_status(self, obj):
        return 'Active' if obj.user and obj.user.is_active else 'Inactive' if obj.user else 'Not created'


class AttendanceSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    school_class_name = serializers.SerializerMethodField()
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Attendance
        fields = ['id', 'student', 'student_name', 'school_class', 'school_class_name', 'attendance_date', 'status', 'remarks', 'recorded_by', 'recorded_by_name']
        read_only_fields = ['student_name', 'school_class_name', 'recorded_by_name']

    def get_student_name(self, obj):
        return obj.student.name if obj.student else ''

    def get_school_class_name(self, obj):
        return obj.school_class.name if obj.school_class else ''

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.get_full_name() or obj.recorded_by.username if obj.recorded_by else ''


class ExamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Exam
        fields = '__all__'

    def validate(self, attrs):
        school_class = attrs.get('school_class', getattr(self.instance, 'school_class', None))
        name = str(attrs.get('name', getattr(self.instance, 'name', '')) or '').strip()
        subject = str(attrs.get('subject', getattr(self.instance, 'subject', '')) or '').strip()
        academic_year = str(attrs.get('academic_year', getattr(self.instance, 'academic_year', '2026')) or '').strip()
        exam_date = attrs.get('exam_date', getattr(self.instance, 'exam_date', None))

        if not name:
            raise serializers.ValidationError({'name': 'Exam name is required.'})
        if not subject:
            raise serializers.ValidationError({'subject': 'Subject is required.'})
        if not school_class:
            raise serializers.ValidationError({'school_class': 'Class is required.'})
        if not academic_year:
            raise serializers.ValidationError({'academic_year': 'Academic year is required.'})
        if not exam_date:
            raise serializers.ValidationError({'exam_date': 'Exam date is required.'})
        start_date = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end_date = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({'end_date': 'End date cannot be before start date.'})
        subjects = attrs.get('subjects', getattr(self.instance, 'subjects', None)) or ([subject] if subject else [])
        if not isinstance(subjects, list) or not all(str(item).strip() for item in subjects):
            raise serializers.ValidationError({'subjects': 'Subjects must be a non-empty list of names.'})
        attrs['subjects'] = list(dict.fromkeys(str(item).strip() for item in subjects))
        class_subjects = [str(item).strip() for item in (getattr(school_class, 'subjects', []) or []) if str(item).strip()]
        class_subjects += list(school_class.teacher_set.filter(status='Active').values_list('subject', flat=True))
        class_subjects += list(school_class.timetableentry_set.values_list('subject', flat=True))
        class_subjects = list(dict.fromkeys(str(item).strip() for item in class_subjects if str(item).strip()))
        if class_subjects and not set(attrs['subjects']).issubset(set(class_subjects)):
            raise serializers.ValidationError({'subjects': 'Every exam subject must be assigned to the selected class.'})
        return attrs


class ResultSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    exam_name = serializers.SerializerMethodField()

    class Meta:
        model = Result
        fields = ['id', 'student', 'student_name', 'exam', 'exam_name', 'subject', 'marks', 'total_marks', 'percentage', 'grade', 'status']
        read_only_fields = ['student_name', 'exam_name']

    def validate(self, attrs):
        student = attrs.get('student', getattr(self.instance, 'student', None))
        exam = attrs.get('exam', getattr(self.instance, 'exam', None))
        marks = attrs.get('marks', getattr(self.instance, 'marks', 0))
        total_marks = attrs.get('total_marks', getattr(self.instance, 'total_marks', 100))
        subject = str(attrs.get('subject', getattr(self.instance, 'subject', exam.subject if exam else '')) or '').strip()

        if not student or not exam:
            raise serializers.ValidationError('Student and exam are required.')
        if not subject:
            subject = str(exam.subject or '').strip()
        if not subject:
            raise serializers.ValidationError({'subject': 'Subject is required.'})
        if total_marks <= 0:
            raise serializers.ValidationError({'total_marks': 'Total marks must be greater than zero.'})
        if marks < 0 or marks > total_marks:
            raise serializers.ValidationError({'marks': 'Marks must be between zero and total marks.'})
        if student.school_class_id != exam.school_class_id:
            raise serializers.ValidationError({'student': 'Student does not belong to the exam class.'})
        allowed_subjects = exam.subjects or [exam.subject]
        if subject not in allowed_subjects:
            raise serializers.ValidationError({'subject': 'Subject is not assigned to this examination.'})
        class_subjects = getattr(exam.school_class, 'subjects', []) or []
        if class_subjects and subject not in class_subjects:
            raise serializers.ValidationError({'subject': 'Subject is not assigned to this class.'})
        if Result.objects.filter(student=student, exam=exam, subject=subject).exclude(id=getattr(self.instance, 'id', None)).exists():
            raise serializers.ValidationError('A result for this student, exam, and subject already exists.')

        attrs['subject'] = subject
        attrs['percentage'] = round((marks / total_marks) * 100, 2)
        attrs['grade'] = 'A' if attrs['percentage'] >= 90 else 'B' if attrs['percentage'] >= 80 else 'C' if attrs['percentage'] >= 70 else 'D' if attrs['percentage'] >= 60 else 'E'
        attrs['status'] = attrs.get('status', 'Entered')
        return attrs

    def get_student_name(self, obj):
        return obj.student.name if obj.student else ''

    def get_exam_name(self, obj):
        return obj.exam.name if obj.exam else ''


class FeePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeePayment
        fields = ['id', 'fee', 'amount', 'payment_date', 'payment_method', 'notes', 'recorded_by']
        read_only_fields = ['recorded_by']

    def validate(self, attrs):
        amount = attrs.get('amount', getattr(self.instance, 'amount', 0))
        fee = attrs.get('fee', getattr(self.instance, 'fee', None))
        if not fee:
            raise serializers.ValidationError({'fee': 'Fee is required.'})
        if amount is None or amount <= 0:
            raise serializers.ValidationError({'amount': 'Payment amount must be greater than zero.'})
        remaining = float(fee.remaining_amount if fee.remaining_amount is not None else fee.amount or 0)
        if amount > remaining:
            raise serializers.ValidationError({'amount': 'Payment amount cannot exceed the remaining fee.'})
        return attrs


class FeeSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    class_name = serializers.SerializerMethodField()
    payments = FeePaymentSerializer(many=True, read_only=True)

    class Meta:
        model = Fee
        fields = [
            'id', 'student', 'student_name', 'class_name', 'school_class', 'fee_type', 'academic_year',
            'amount', 'total_due', 'paid_amount', 'remaining_amount', 'due_date', 'payment_date',
            'status', 'payment_method', 'notes', 'created_by', 'payments'
        ]
        read_only_fields = ['student_name', 'class_name', 'paid_amount', 'remaining_amount', 'status', 'payment_date', 'payments']

    def validate(self, attrs):
        student = attrs.get('student', getattr(self.instance, 'student', None))
        fee_type = str(attrs.get('fee_type', getattr(self.instance, 'fee_type', '')) or '').strip()
        amount = attrs.get('amount', getattr(self.instance, 'amount', 0))
        total_due = attrs.get('total_due', getattr(self.instance, 'total_due', None))
        academic_year = str(attrs.get('academic_year', getattr(self.instance, 'academic_year', '2026')) or '').strip()
        due_date = attrs.get('due_date', getattr(self.instance, 'due_date', None))

        if not student:
            raise serializers.ValidationError({'student': 'Student is required.'})
        if not fee_type:
            raise serializers.ValidationError({'fee_type': 'Fee type is required.'})
        if amount is None or amount <= 0:
            raise serializers.ValidationError({'amount': 'Amount must be greater than zero.'})
        if not academic_year:
            raise serializers.ValidationError({'academic_year': 'Academic year is required.'})
        if due_date is None:
            raise serializers.ValidationError({'due_date': 'Due date is required.'})
        if total_due is not None and total_due <= 0:
            raise serializers.ValidationError({'total_due': 'Total due must be greater than zero.'})
        if total_due is not None and amount > total_due:
            raise serializers.ValidationError({'amount': 'Amount cannot exceed the total due.'})
        return attrs

    def get_student_name(self, obj):
        return obj.student.name if obj.student else ''

    def get_class_name(self, obj):
        if obj.school_class:
            return obj.school_class.name
        return obj.student.school_class.name if obj.student and obj.student.school_class else ''


class AnnouncementSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    school_class_name = serializers.SerializerMethodField()
    effective_status = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = ['id', 'title', 'content', 'created_by', 'created_by_name', 'audience', 'school_class', 'school_class_name', 'status', 'effective_status', 'publish_at', 'expires_at', 'created_at']
        read_only_fields = ['created_by', 'created_by_name']

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username if obj.created_by else ''

    def get_school_class_name(self, obj):
        return obj.school_class.name if obj.school_class else ''

    def get_effective_status(self, obj):
        now = timezone.now()
        if obj.expires_at and obj.expires_at <= now:
            return 'Expired'
        if obj.status == 'Published' and obj.publish_at and obj.publish_at > now:
            return 'Scheduled'
        return obj.status

    def validate(self, attrs):
        audience = attrs.get('audience', getattr(self.instance, 'audience', 'Everyone'))
        school_class = attrs.get('school_class', getattr(self.instance, 'school_class', None))
        if audience == 'Class' and not school_class:
            raise serializers.ValidationError({'school_class': 'A class is required for class announcements.'})
        if audience != 'Class':
            attrs['school_class'] = None
        publish_at = attrs.get('publish_at', getattr(self.instance, 'publish_at', None))
        expires_at = attrs.get('expires_at', getattr(self.instance, 'expires_at', None))
        if publish_at and expires_at and expires_at <= publish_at:
            raise serializers.ValidationError({'expires_at': 'Expiry must be after the publish date.'})
        return attrs


class TimetableEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = TimetableEntry
        fields = '__all__'


class HomeworkSerializer(serializers.ModelSerializer):
    class Meta:
        model = Homework
        fields = '__all__'


class SchoolSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolSettings
        fields = ['id', 'school_name', 'phone', 'address', 'academic_year', 'logo', 'updated_at']
        read_only_fields = ['updated_at']
