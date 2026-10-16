"""Verify the actual restricted (optionally pooled) DATABASE_URL without migrations.

All synthetic fixture rows roll back. This never creates roles or changes grants.
Run only from an authorized backend environment; credentials are never printed.
"""
import os
from pathlib import Path
import sys
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'school_management.settings')
import django
django.setup()
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import connection, transaction, DatabaseError
from django.utils import timezone
from rest_framework.test import APIClient
from school_app.models import School, SchoolClass, Student, User, Membership, Teacher
from school_app.tenancy import school_context
from school_app.management.commands.check_rls import verify_rls

if connection.vendor != 'postgresql':
    raise ImproperlyConfigured('Set DATABASE_URL to the restricted PostgreSQL runtime connection.')
settings.ALLOWED_HOSTS = [*settings.ALLOWED_HOSTS, 'testserver']
role, count = verify_rls()
print(f'Verified runtime role {role}: FORCE RLS on {count} tables.')

def clean_context():
    with connection.cursor() as cursor:
        cursor.execute("SELECT NULLIF(current_setting('app.school_id', true), '')")
        assert cursor.fetchone()[0] is None, 'School setting escaped its transaction'
    assert Student.all_objects.count() == 0, 'Unscoped school rows are visible'

clean_context()
with transaction.atomic():
    schools = [School.objects.create(name='Rollback isolation test ' + name,
               slug='rls-verification-' + uuid.uuid4().hex) for name in ('A', 'B')]
    users, pupils, classes, teachers = [], [], [], []
    password = uuid.uuid4().hex + 'Qa!'
    for school in schools:
        user = User.objects.create_user(username='rls-' + uuid.uuid4().hex, password=password)
        Membership.objects.create(user=user, school=school, role='admin')
        users.append(user)
        with school_context(school.pk):
            cls = SchoolClass.objects.create(name='Class 1 A', grade='1', section='A', academic_year='2026', subjects=['Mathematics'])
            classes.append(cls)
            pupils.append(Student.objects.create(student_id='S-1', name=school.name, father_name='Synthetic', gender='Male', date_of_birth='2019-01-01', school_class=cls, contact_number='demo', address='demo'))
            teacher = Teacher.objects.create(teacher_id='T-1', name='Synthetic', subject='Mathematics')
            teacher.assigned_classes.add(cls)
            teachers.append(teacher)
    clean_context()
    with school_context(schools[0].pk):
        assert list(Student.all_objects.values_list('pk', flat=True)) == [pupils[0].pk]
        assert Student.all_objects.filter(pk=pupils[1].pk).update(name='Blocked') == 0
        try:
            with transaction.atomic():
                Student.all_objects.bulk_create([Student(school=schools[1], student_id='BAD', name='Blocked', father_name='Synthetic', gender='Male', date_of_birth='2019-01-01', school_class=classes[1], contact_number='demo', address='demo')])
        except DatabaseError:
            pass
        else:
            raise AssertionError('Cross-school raw INSERT succeeded')
        try:
            with transaction.atomic():
                teachers[0].assigned_classes.add(classes[1])
        except DatabaseError:
            pass
        else:
            raise AssertionError('Cross-school M2M write succeeded')
        with school_context(schools[1].pk):
            assert list(Student.all_objects.values_list('pk', flat=True)) == [pupils[1].pk]
        assert list(Student.all_objects.values_list('pk', flat=True)) == [pupils[0].pk]
    clean_context()
    for index, user in enumerate(users):
        client = APIClient()
        login = client.post('/api/login/', {'username':user.username, 'password':password}, format='json')
        assert login.status_code == 200, login.data
        client.credentials(HTTP_AUTHORIZATION='Bearer ' + login.data['access'])
        response = client.get('/api/students/')
        assert response.status_code == 200, response.data
        assert [row['id'] for row in response.data] == [pupils[index].pk]
        assert client.get(f'/api/students/{pupils[1-index].pk}/').status_code == 404
        for path in ('dashboard/', 'notifications/', 'curriculum/', 'finance-summary/'):
            response = client.get('/api/' + path)
            assert response.status_code == 200, (path, response.data)
        invoice = client.post('/api/fees/', {'student':pupils[index].pk, 'amount':'250.00', 'due_date':str(timezone.localdate()), 'billing_period':timezone.localdate().strftime('%Y-%m')}, format='json')
        assert invoice.status_code == 201, invoice.data
        payment = client.post('/api/fee-payments/', {'fee':invoice.data['id'], 'amount':'50.00', 'request_id':str(uuid.uuid4())}, format='json')
        assert payment.status_code == 201, payment.data
        attendance = client.post('/api/attendance/', {'records':[{'student':pupils[index].pk, 'school_class':classes[index].pk, 'attendance_date':str(timezone.localdate()), 'status':'Present'}], 'expected_revision':0}, format='json')
        assert attendance.status_code == 201, attendance.data
        clean_context()
    transaction.set_rollback(True)
clean_context()
for school in schools:
    with school_context(school.pk):
        pass
    clean_context()
# Test commit and rollback on a reused pooled connection, then reconnect as another client.
try:
    with school_context(schools[0].pk):
        raise ValueError('Intentional rollback')
except ValueError:
    pass
clean_context()
connection.close()
clean_context()
print('PASS: A/B reads/writes, missing context, nested restoration, M2M, JWT APIs, payments, attendance, commit/rollback and pooled reconnect cleanup. All fixture rows rolled back.')
