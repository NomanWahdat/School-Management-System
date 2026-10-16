"""Isolated browser QA server. No connection to the real school database/media."""
import os
from pathlib import Path
import sys
import uuid
from decimal import Decimal

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'backend'))
os.environ['DJANGO_SETTINGS_MODULE'] = 'school_management.settings'
from django.conf import settings
qa_storage = root / 'backend' / '.verification'
qa_storage.mkdir(parents=True, exist_ok=True)
settings.DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': str(qa_storage / ('browser-' + uuid.uuid4().hex + '.sqlite3')), 'OPTIONS': {'timeout': 20, 'transaction_mode': 'IMMEDIATE'}}}
settings.MEDIA_ROOT = root / 'backend' / '.verification' / 'media'
settings.STORAGES['default'] = {'BACKEND': 'django.core.files.storage.FileSystemStorage'}
settings.ALLOWED_HOSTS = ['127.0.0.1', 'localhost']
settings.CORS_ALLOWED_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173']
settings.PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
settings.DEBUG = True

import django
django.setup()
from django.db import connection
with connection.cursor() as cursor:
    cursor.execute('PRAGMA journal_mode=WAL')
from django.core.management import call_command
from django.utils import timezone
from school_app.models import School, User, Membership, SchoolClass, SchoolSettings, Student, Teacher, Exam, Fee, Announcement
from school_app.tenancy import school_context
call_command('migrate', verbosity=0)
admin = User.objects.create_user(username='qa-admin', password='QA-school-password-2026')
teacher_user = User.objects.create_user(username='qa-teacher', password='QA-school-password-2026')
User.objects.create_superuser(username='qa-platform', password='QA-school-password-2026')
for ordinal, name in enumerate(['School A', 'School B'], start=1):
    school = School.objects.create(name=name, slug=f'qa-{ordinal}')
    Membership.objects.create(user=admin, school=school, role='admin')
    with school_context(school.pk):
        SchoolSettings.objects.create(school_name=name, academic_year='2026', teaching_days=['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday'], grading_scale={'A':90,'B':80,'C':70,'D':60,'E':0})
        cls = SchoolClass.objects.create(name=f'Grade 8 · {name}', grade='8', academic_year='2026', subjects=['Mathematics', 'English'])
        SchoolClass.objects.create(name=f'Grade 9 · {name}', grade='9', academic_year='2027', subjects=['Mathematics', 'English'])
        teacher = Teacher.objects.create(teacher_id='T-001', name=f'{name} Teacher', phone_number='0700000000', subject='Mathematics', user=teacher_user if ordinal == 1 else None)
        teacher.assigned_classes.add(cls)
        if ordinal == 1: Membership.objects.create(user=teacher_user, school=school, role='teacher')
        for student_ordinal in range(1, 5):
            student = Student.objects.create(student_id=f'S-{student_ordinal:03d}', name=f'{name} Student {student_ordinal}', father_name='Sample Guardian', gender='Male', date_of_birth='2012-01-01', school_class=cls, contact_number='0700000000', address='Kabul')
            Fee.objects.create(student=student, school_class=cls, amount=Decimal('500'), total_due=Decimal('500'), remaining_amount=Decimal('500'), due_date=timezone.localdate())
        Exam.objects.create(name=f'{name} monthly examination', school_class=cls, subject='Mathematics', subjects=['Mathematics'], exam_date=timezone.localdate(), max_marks=100)
        Announcement.objects.create(title=f'Welcome to {name}', content='Our school workspace is ready for the new term.', created_by=admin)

call_command('runserver', '127.0.0.1:8000', use_reloader=False, verbosity=0)
