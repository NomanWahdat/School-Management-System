from datetime import date

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('teacher', 'Teacher'),
    ]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='admin')
    must_change_password = models.BooleanField(default=False)
    last_logout_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.username


class SchoolClass(models.Model):
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Inactive', 'Inactive'),
    ]

    name = models.CharField(max_length=100)
    grade = models.CharField(max_length=50, blank=True, null=True)
    academic_year = models.CharField(max_length=20, blank=True, null=True)
    subjects = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Active')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('name', 'grade', 'academic_year')

    def __str__(self):
        return self.name


class Student(models.Model):
    GENDER_CHOICES = [
        ('Male', 'Male'),
        ('Female', 'Female'),
    ]
    FEE_STATUS_CHOICES = [
        ('Paid', 'Paid'),
        ('Partially Paid', 'Partially Paid'),
        ('Pending', 'Pending'),
    ]

    student_id = models.CharField(max_length=50, unique=True)
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

    def __str__(self):
        return f'{self.name} ({self.student_id})'


class Teacher(models.Model):
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Inactive', 'Inactive'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, null=True, blank=True)
    teacher_id = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=150)
    phone_number = models.CharField(max_length=30)
    subject = models.CharField(max_length=100)
    assigned_classes = models.ManyToManyField(SchoolClass, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Active')

    def __str__(self):
        return self.name


class Attendance(models.Model):
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

    class Meta:
        unique_together = ('student', 'school_class', 'attendance_date')

    def __str__(self):
        return f'{self.student.name} - {self.school_class.name if self.school_class else "Class"} - {self.status}'


class Exam(models.Model):
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


class Result(models.Model):
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


class Fee(models.Model):
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
    created_at = models.DateTimeField(default=timezone.now)

    def recalculate_totals(self):
        total_due = float(self.total_due or self.amount or 0)
        total_paid = float(sum((payment.amount or 0) for payment in self.payments.all()))
        self.paid_amount = total_paid
        self.remaining_amount = max(total_due - total_paid, 0)
        if self.remaining_amount == 0:
            self.status = 'Paid'
        elif total_paid > 0:
            self.status = 'Partially Paid'
        else:
            self.status = 'Pending'
        self.save(update_fields=['paid_amount', 'remaining_amount', 'status'])

    def __str__(self):
        return f'{self.student.name} - {self.fee_type} - {self.amount}'


class FeePayment(models.Model):
    fee = models.ForeignKey(Fee, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_date = models.DateField(default=date.today)
    payment_method = models.CharField(max_length=50, default='Cash')
    notes = models.CharField(max_length=255, blank=True, default='')
    recorded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='fee_payments')
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.fee.recalculate_totals()

    def __str__(self):
        return f'{self.fee.student.name} - {self.amount}'


class Homework(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField()
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE)
    subject = models.CharField(max_length=100)
    due_date = models.DateField()
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class Announcement(models.Model):
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


class SchoolSettings(models.Model):
    school_name = models.CharField(max_length=200, default='Rayan Tech Solutions School')
    phone = models.CharField(max_length=50, blank=True, default='')
    address = models.TextField(blank=True, default='')
    academic_year = models.CharField(max_length=20, default='2026')
    logo = models.FileField(upload_to='school/', blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.school_name


class TimetableEntry(models.Model):
    day = models.CharField(max_length=20)
    start_time = models.TimeField()
    end_time = models.TimeField()
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE)
    subject = models.CharField(max_length=100)
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE)

    def __str__(self):
        return f'{self.school_class.name} - {self.subject}'
