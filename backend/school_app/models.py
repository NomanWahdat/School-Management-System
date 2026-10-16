from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from .tenancy import SchoolOwned


def school_logo_path(instance, filename):
    owner = getattr(instance, 'school_id', None) or instance.pk
    return f'schools/{owner}/branding/{uuid4().hex}{Path(filename).suffix.lower()}'


class School(models.Model):
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=80, unique=True)
    is_active = models.BooleanField(default=True)
    logo = models.FileField(upload_to=school_logo_path, null=True, blank=True)
    appearance = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('teacher', 'Teacher'),
    ]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='admin')
    must_change_password = models.BooleanField(default=False)
    last_logout_at = models.DateTimeField(null=True, blank=True)
    # role is retained only as legacy migration data. Membership authorizes school APIs.
    session_version = models.PositiveIntegerField(default=0)

    def __str__(self):
        return self.username


class Membership(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='memberships')
    school = models.ForeignKey(School, on_delete=models.PROTECT, related_name='memberships')
    role = models.CharField(max_length=20, choices=[('admin', 'School Admin'), ('teacher', 'Teacher')])
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'school'], name='unique_school_membership')]


class AuditEvent(models.Model):
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    school = models.ForeignKey(School, on_delete=models.PROTECT, null=True, blank=True)
    action = models.CharField(max_length=80)
    target = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['school', '-created_at'])]


class LoginThrottle(models.Model):
    key = models.CharField(max_length=64, unique=True)
    failures = models.PositiveIntegerField(default=0)
    window_started_at = models.DateTimeField(default=timezone.now)


class SchoolClass(SchoolOwned):
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Inactive', 'Inactive'),
    ]

    name = models.CharField(max_length=100)
    grade = models.CharField(max_length=50, blank=True, null=True)
    section = models.CharField(max_length=8, blank=True, default='')
    academic_year = models.CharField(max_length=20, blank=True, null=True)
    subjects = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Active')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(SchoolOwned.Meta):
        unique_together = ('school', 'name', 'grade', 'academic_year')
        indexes = [models.Index(fields=['school', 'status'])]

    def __str__(self):
        return self.name


class Student(SchoolOwned):
    GENDER_CHOICES = [
        ('Male', 'Male'),
        ('Female', 'Female'),
    ]
    FEE_STATUS_CHOICES = [
        ('Paid', 'Paid'),
        ('Partially Paid', 'Partially Paid'),
        ('Pending', 'Pending'),
    ]

    student_id = models.CharField(max_length=50)
    name = models.CharField(max_length=150)
    father_name = models.CharField(max_length=150)
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES)
    date_of_birth = models.DateField()
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='students')
    contact_number = models.CharField(max_length=30)
    address = models.TextField()
    admission_date = models.DateField(auto_now_add=True)
    fee_status = models.CharField(max_length=30, choices=FEE_STATUS_CHOICES, default='Pending')
    is_active = models.BooleanField(default=True)

    class Meta(SchoolOwned.Meta):
        constraints = [models.UniqueConstraint(fields=['school', 'student_id'], name='school_student_number')]
        indexes = [models.Index(fields=['school', 'school_class', 'is_active'])]

    def __str__(self):
        return f'{self.name} ({self.student_id})'


class Teacher(SchoolOwned):
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Inactive', 'Inactive'),
    ]

    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='teacher_profiles')
    teacher_id = models.CharField(max_length=50)
    name = models.CharField(max_length=150)
    phone_number = models.CharField(max_length=30)
    subject = models.CharField(max_length=100)
    assigned_classes = models.ManyToManyField(SchoolClass, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Active')

    class Meta(SchoolOwned.Meta):
        constraints = [
            models.UniqueConstraint(fields=['school', 'teacher_id'], name='school_teacher_number'),
            models.UniqueConstraint(fields=['school', 'user'], name='school_teacher_account'),
        ]

    def __str__(self):
        return self.name


class Attendance(SchoolOwned):
    STATUS_CHOICES = [
        ('Present', 'Present'),
        ('Absent', 'Absent'),
        ('Late', 'Late'),
    ]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='attendance_records')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='attendance_records', null=True, blank=True)
    attendance_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    remarks = models.CharField(max_length=200, blank=True, null=True)
    recorded_by = models.ForeignKey(User, on_delete=models.SET_NULL, related_name='attendance_records', null=True, blank=True)

    class Meta(SchoolOwned.Meta):
        unique_together = ('school', 'student', 'school_class', 'attendance_date')
        indexes = [models.Index(fields=['school', 'attendance_date'])]

    def __str__(self):
        return f'{self.student.name} - {self.school_class.name if self.school_class else "Class"} - {self.status}'


class Exam(SchoolOwned):
    EXAM_TYPE_CHOICES = [
        ('Monthly Test', 'Monthly Test'),
        ('Four-and-a-Half-Month Examination', 'Four-and-a-Half-Month Examination'),
        ('Annual Examination', 'Annual Examination'),
        ('Midterm Examination', 'Midterm Examination'),
        ('Final Examination', 'Final Examination'),
        ('Other', 'Other'),
    ]

    name = models.CharField(max_length=100)
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE)
    subject = models.CharField(max_length=100)
    subjects = models.JSONField(default=list, blank=True)
    exam_type = models.CharField(max_length=40, choices=EXAM_TYPE_CHOICES, default='Monthly Test')
    academic_year = models.CharField(max_length=20, default='2026')
    exam_date = models.DateField()
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    max_marks = models.FloatField(default=100)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.name} - {self.school_class}'


class Result(SchoolOwned):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='results')
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='results')
    subject = models.CharField(max_length=100, default='')
    marks = models.FloatField(default=0)
    total_marks = models.FloatField(default=100)
    percentage = models.FloatField(default=0)
    grade = models.CharField(max_length=10, blank=True, null=True)
    status = models.CharField(max_length=30, default='Entered')

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['student', 'exam', 'subject'], name='unique_result_per_student_exam_subject'),
        ]

    def __str__(self):
        return f'{self.student.name} - {self.exam.name} - {self.subject}'


class Fee(SchoolOwned):
    FEE_TYPE_CHOICES = [
        ('Monthly Tuition Fee', 'Monthly Tuition Fee'),
        ('Admission Fee', 'Admission Fee'),
        ('Registration Fee', 'Registration Fee'),
        ('Examination Fee', 'Examination Fee'),
        ('Other School Fee', 'Other School Fee'),
    ]
    STATUS_CHOICES = [
        ('Paid', 'Paid'),
        ('Partially Paid', 'Partially Paid'),
        ('Pending', 'Pending'),
    ]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='fees')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='fees', null=True, blank=True)
    fee_type = models.CharField(max_length=100, default='Monthly Tuition Fee')
    academic_year = models.CharField(max_length=20, default='2026')
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_due = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    remaining_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    due_date = models.DateField(null=True, blank=True)
    payment_date = models.DateField(default=date.today)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='Pending')
    payment_method = models.CharField(max_length=50, blank=True, default='Cash')
    notes = models.CharField(max_length=255, blank=True, default='')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_fees')
    billing_period = models.CharField(max_length=7, blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)
    is_active = models.BooleanField(default=True)

    class Meta(SchoolOwned.Meta):
        constraints = [models.UniqueConstraint(fields=['school', 'student', 'fee_type', 'billing_period'], condition=models.Q(is_active=True) & ~models.Q(billing_period=''), name='school_student_monthly_invoice')]

    def recalculate_totals(self):
        total_due = self.total_due if self.total_due is not None else self.amount
        total_paid = sum((payment.amount for payment in self.payments.all()), Decimal('0.00'))
        self.paid_amount = total_paid
        self.remaining_amount = max(total_due - total_paid, 0)
        if self.remaining_amount == 0:
            self.status = 'Paid'
        elif total_paid > 0:
            self.status = 'Partially Paid'
        else:
            self.status = 'Pending'
        self.save(update_fields=['paid_amount', 'remaining_amount', 'status'])
        fees = Fee.all_objects.filter(school_id=self.school_id, student_id=self.student_id, is_active=True)
        due = sum((item.remaining_amount for item in fees), Decimal('0.00'))
        paid = sum((item.paid_amount for item in fees), Decimal('0.00'))
        Student.all_objects.filter(pk=self.student_id, school_id=self.school_id).update(
            fee_status='Paid' if due == 0 else 'Partially Paid' if paid > 0 else 'Pending')

    def __str__(self):
        return f'{self.student.name} - {self.fee_type} - {self.amount}'


class FeePayment(SchoolOwned):
    fee = models.ForeignKey(Fee, on_delete=models.PROTECT, related_name='payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_date = models.DateField(default=date.today)
    payment_method = models.CharField(max_length=50, default='Cash')
    notes = models.CharField(max_length=255, blank=True, default='')
    recorded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='fee_payments')
    created_at = models.DateTimeField(auto_now_add=True)
    request_id = models.UUIDField(null=True, blank=True)

    class Meta(SchoolOwned.Meta):
        constraints = [models.UniqueConstraint(fields=['school', 'request_id'], name='school_payment_request')]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.fee.recalculate_totals()

    def __str__(self):
        return f'{self.fee.student.name} - {self.amount}'


class Homework(SchoolOwned):
    title = models.CharField(max_length=200)
    description = models.TextField()
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE)
    subject = models.CharField(max_length=100)
    due_date = models.DateField()
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class Announcement(SchoolOwned):
    AUDIENCE_CHOICES = [
        ('Everyone', 'Everyone'),
        ('Teachers', 'Teachers'),
        ('Students', 'Students'),
        ('Class', 'Specific Class'),
    ]
    STATUS_CHOICES = [
        ('Published', 'Published'),
        ('Draft', 'Draft'),
        ('Archived', 'Archived'),
    ]

    title = models.CharField(max_length=200)
    content = models.TextField()
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    audience = models.CharField(max_length=20, choices=AUDIENCE_CHOICES, default='Everyone')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, null=True, blank=True, related_name='announcements')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Published')
    publish_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class SchoolSettings(SchoolOwned):
    school_name = models.CharField(max_length=200, default='Rayan Tech Solutions School')
    phone = models.CharField(max_length=50, blank=True, default='')
    address = models.TextField(blank=True, default='')
    academic_year = models.CharField(max_length=20, default='2026')
    logo = models.FileField(upload_to=school_logo_path, blank=True, null=True)
    calendar = models.CharField(max_length=20, default='gregory', choices=[('gregory', 'Gregorian'), ('persian', 'Solar Hijri')])
    teaching_days = models.JSONField(default=list, blank=True)
    grading_scale = models.JSONField(default=dict, blank=True)
    allow_teacher_attendance_retake = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(SchoolOwned.Meta):
        constraints = [models.UniqueConstraint(fields=['school'], name='one_settings_per_school')]

    def __str__(self):
        return self.school_name


class TimetableEntry(SchoolOwned):
    day = models.CharField(max_length=20)
    start_time = models.TimeField()
    end_time = models.TimeField()
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE)
    subject = models.CharField(max_length=100)
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE)

    def __str__(self):
        return f'{self.school_class.name} - {self.subject}'


class Guardian(SchoolOwned):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='guardians')
    name = models.CharField(max_length=150)
    relationship = models.CharField(max_length=50)
    phone_number = models.CharField(max_length=30)
    alternate_phone = models.CharField(max_length=30, blank=True)
    is_emergency_contact = models.BooleanField(default=False)


class Enrollment(SchoolOwned):
    student = models.ForeignKey(Student, on_delete=models.PROTECT, related_name='enrollments')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.PROTECT)
    academic_year = models.CharField(max_length=20)
    enrolled_at = models.DateField(default=date.today)
    ended_at = models.DateField(null=True, blank=True)

    class Meta(SchoolOwned.Meta):
        constraints = [models.UniqueConstraint(fields=['school', 'student', 'school_class', 'academic_year'], name='school_enrollment_history')]


class AttendanceSession(SchoolOwned):
    school_class = models.ForeignKey(SchoolClass, on_delete=models.PROTECT)
    attendance_date = models.DateField()
    revision = models.PositiveIntegerField(default=1)
    taken_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    actor_name = models.CharField(max_length=150)
    actor_identifier = models.CharField(max_length=150)
    actor_role = models.CharField(max_length=20)
    saved_at = models.DateTimeField(default=timezone.now)
    class Meta(SchoolOwned.Meta):
        constraints = [models.UniqueConstraint(fields=['school', 'school_class', 'attendance_date'], name='school_attendance_session')]


class AttendanceRevision(SchoolOwned):
    session = models.ForeignKey(AttendanceSession, on_delete=models.PROTECT, related_name='history')
    revision = models.PositiveIntegerField()
    actor_name = models.CharField(max_length=150)
    actor_identifier = models.CharField(max_length=150)
    actor_role = models.CharField(max_length=20)
    saved_at = models.DateTimeField(default=timezone.now)
    reason = models.CharField(max_length=255, blank=True)
    # Immutable register snapshot keeps previous status and attribution on retake.
    records = models.JSONField(default=list)
    class Meta(SchoolOwned.Meta):
        constraints = [models.UniqueConstraint(fields=['school', 'session', 'revision'], name='school_attendance_revision')]


class Notification(SchoolOwned):
    recipient = models.ForeignKey(User, on_delete=models.CASCADE)
    event_key = models.CharField(max_length=120)
    title = models.CharField(max_length=160)
    message = models.CharField(max_length=400)
    section = models.CharField(max_length=30)
    school_class = models.ForeignKey(SchoolClass, on_delete=models.PROTECT, null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    class Meta(SchoolOwned.Meta):
        constraints = [models.UniqueConstraint(fields=['school', 'recipient', 'event_key'], name='school_notification_recipient_event')]
        indexes = [models.Index(fields=['school', 'recipient', 'read_at'])]
