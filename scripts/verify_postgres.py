"""Exercise real migrations + RLS with a restricted login in a disposable PostgreSQL DB.

TEST_DATABASE_URL must point to a database named test_school_*. Never use live data.
Creates a dedicated temporary runtime login; all synthetic fixture rows roll back.
"""
import os
from pathlib import Path
import secrets
import sys
from urllib.parse import urlparse
import uuid
import psycopg
from psycopg import sql

url = os.environ.get('TEST_DATABASE_URL', '')
if not urlparse(url).path.lstrip('/').startswith('test_school_'):
    raise SystemExit('Set TEST_DATABASE_URL to an isolated test_school_* PostgreSQL database.')
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','school_management.settings')
from django.conf import settings
import dj_database_url
settings.DATABASES = {'default':dj_database_url.parse(url,conn_max_age=0)}
settings.PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
settings.ALLOWED_HOSTS = ['testserver']
import django
django.setup()
from django.core.management import call_command
from django.db import connection, transaction, DatabaseError
from django.utils import timezone
from rest_framework.test import APIClient
from school_app.models import School, SchoolClass, Student, User, Membership, Teacher, Attendance
from school_app.tenancy import school_context
from school_app.management.commands.check_rls import verify_rls

call_command('migrate',verbosity=0)
runtime_role = 'school_test_' + uuid.uuid4().hex[:12]
password = secrets.token_urlsafe(30)
owner = psycopg.connect(url, autocommit=True)
try:
    owner.execute(sql.SQL('CREATE ROLE {} LOGIN PASSWORD {} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT').format(sql.Identifier(runtime_role),sql.Literal(password)))
    owner.execute(sql.SQL('GRANT USAGE ON SCHEMA public TO {}').format(sql.Identifier(runtime_role)))
    owner.execute(sql.SQL('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO {}').format(sql.Identifier(runtime_role)))
    owner.execute(sql.SQL('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO {}').format(sql.Identifier(runtime_role)))
    connection.close()
    connection.settings_dict.update(USER=runtime_role,PASSWORD=password)
    role,count=verify_rls()
    print(f'Policies/role: {count} tables enforce FORCE RLS through a non-owner restricted login.')
    with transaction.atomic():
        a=School.objects.create(name='RLS A',slug='rls-a-'+uuid.uuid4().hex[:8])
        b=School.objects.create(name='RLS B',slug='rls-b-'+uuid.uuid4().hex[:8])
        users=[]; pupils=[]; classes=[]; teachers=[]
        for school in (a,b):
            user=User.objects.create_user(username='rls-'+uuid.uuid4().hex[:10],password='RLS-test-password-2026')
            Membership.objects.create(user=user,school=school,role='admin');users.append(user)
            with school_context(school.pk):
                cls=SchoolClass.objects.create(name='Class 1 A',grade='1',section='A',academic_year='2026',subjects=['Mathematics']);classes.append(cls)
                pupil=Student.objects.create(student_id='S-1',name=school.name,father_name='Demo',gender='Male',date_of_birth='2019-01-01',school_class=cls,contact_number='demo',address='Demo');pupils.append(pupil)
                teacher=Teacher.objects.create(teacher_id='T-1',name='Demo',subject='Mathematics');teacher.assigned_classes.add(cls);teachers.append(teacher)
        assert Student.all_objects.count()==0
        with school_context(a.pk):
            assert list(Student.all_objects.values_list('pk',flat=True))==[pupils[0].pk]
            assert Student.all_objects.filter(pk=pupils[1].pk).update(name='Blocked')==0
            with connection.cursor() as cursor:
                cursor.execute('SELECT COUNT(*) FROM school_app_teacher_assigned_classes')
                assert cursor.fetchone()[0]==1
            try:
                with transaction.atomic():
                    Student.all_objects.bulk_create([Student(school=b,student_id='BAD',name='Blocked',father_name='Demo',gender='Male',date_of_birth='2019-01-01',school_class=classes[1],contact_number='demo',address='demo')])
            except DatabaseError:
                pass
            else:
                raise AssertionError('RLS permitted another school INSERT')
            try:
                with transaction.atomic():
                    teachers[0].assigned_classes.add(classes[1])
            except DatabaseError:
                pass
            else:
                raise AssertionError('Cross-school M2M write succeeded')
            with school_context(b.pk):
                assert list(Student.all_objects.values_list('pk',flat=True))==[pupils[1].pk]
            assert list(Student.all_objects.values_list('pk',flat=True))==[pupils[0].pk]
        assert Student.all_objects.count()==0
        for index,user in enumerate(users):
            client=APIClient()
            login=client.post('/api/login/',{'username':user.username,'password':'RLS-test-password-2026'},format='json')
            assert login.status_code==200,login.data
            client.credentials(HTTP_AUTHORIZATION='Bearer '+login.data['access'])
            response=client.get('/api/students/')
            assert response.status_code==200,response.data
            assert [row['id'] for row in response.data]==[pupils[index].pk]
            assert client.get(f'/api/students/{pupils[1-index].pk}/').status_code==404
            for path in ('dashboard/','notifications/','curriculum/','finance-summary/'):
                checked=client.get('/api/'+path)
                assert checked.status_code==200,(path,checked.data)
            invoice=client.post('/api/fees/',{'student':pupils[index].pk,'amount':'250.00','due_date':str(timezone.localdate()),'billing_period':timezone.localdate().strftime('%Y-%m')},format='json')
            assert invoice.status_code==201,invoice.data
            payment=client.post('/api/fee-payments/',{'fee':invoice.data['id'],'amount':'50.00','request_id':str(uuid.uuid4())},format='json')
            assert payment.status_code==201,payment.data
            register=client.post('/api/attendance/',{'records':[{'student':pupils[index].pk,'school_class':classes[index].pk,'attendance_date':str(timezone.localdate()),'status':'Present'}],'expected_revision':0},format='json')
            assert register.status_code==201,register.data
            assert Student.all_objects.count()==0
        transaction.set_rollback(True)
    assert Student.all_objects.count()==0
    print('Passed: raw/unscoped reads and writes, missing context, A/B switching/nested context reset, M2M guards, JWT lists/details/dashboards/notifications, invoice/payment/attendance writes and post-request/post-transaction cleanup. Synthetic fixture rows rolled back.')
finally:
    connection.close()
    owner.execute(sql.SQL('DROP OWNED BY {}').format(sql.Identifier(runtime_role)))
    owner.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(runtime_role)))
    owner.close()
