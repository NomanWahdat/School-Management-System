from django.core.management import call_command
from django.utils import timezone
from io import StringIO
import json
import os
from unittest.mock import patch
from . import test_isolation
from .models import SchoolSettings, AttendanceSession, AttendanceRevision, Notification, Membership, School, Student, Fee, TimetableEntry
from .tenancy import school_context


class ClassroomWorkflowTests(test_isolation.SchoolIsolationTests):
    # Reuse the established two-school fixtures, without rerunning inherited tests.
    def test_server_demo_bootstrap_is_repeatable_and_preserves_passwords(self):
        from .models import User, Teacher
        accounts = {name:'Synthetic-bootstrap-password-2026!' for name in ('kabul-admin','kabul-teacher','platform-owner')}
        with patch.dict(os.environ, {'SCHOOL_DEMO_ACCOUNTS':json.dumps(accounts)}):
            call_command('bootstrap_school_demo', stdout=StringIO())
        admin = User.objects.get(username='kabul-admin')
        self.assertTrue(admin.must_change_password)
        self.assertFalse(admin.is_superuser)
        self.assertTrue(User.objects.get(username='platform-owner').is_superuser)
        original_password = admin.password
        accounts['kabul-admin'] = 'Another-private-password-2026!'
        with patch.dict(os.environ, {'SCHOOL_DEMO_ACCOUNTS':json.dumps(accounts)}):
            call_command('bootstrap_school_demo', stdout=StringIO())
        admin.refresh_from_db()
        self.assertEqual(admin.password, original_password)
        demo = School.objects.get(slug='kabul-school')
        with school_context(demo.pk):
            self.assertEqual(Student.objects.count(),288)
            self.assertEqual(Teacher.objects.filter(user__username='kabul-teacher',subject='Mathematics').count(),1)

    def test_demo_preserves_original_register_and_seeds_retake_history(self):
        from .models import SchoolClass, Attendance
        output = StringIO()
        call_command('create_school_demo', admin=self.admin.username, students_per_class=4, stdout=output)
        demo = School.objects.get(slug='kabul-school')
        with school_context(demo.pk):
            self.assertEqual(SchoolClass.objects.count(), 24)
            self.assertEqual(Student.objects.count(), 96)
            self.assertEqual(AttendanceSession.objects.filter(revision=2).count(), 24)
            session = AttendanceSession.objects.filter(revision=2).first()
            self.assertEqual(list(session.history.order_by('revision').values_list('revision', flat=True)), [1, 2])
            latest = session.history.get(revision=2)
            self.assertEqual(latest.records[0]['status'], 'Late')
            recorded = Attendance.objects.get(student_id=latest.records[0]['student'], attendance_date=session.attendance_date)
            self.assertEqual(recorded.status, 'Late')
            self.assertEqual(recorded.remarks, latest.records[0]['remarks'])
            self.assertEqual(TimetableEntry.objects.count(), 720)
        call_command('create_school_demo', admin=self.admin.username, students_per_class=4, stdout=output)
        with school_context(demo.pk):
            self.assertEqual(AttendanceSession.objects.filter(revision=2).count(), 24)

    def test_attendance_attribution_retake_permissions_and_conflict(self):
        own = self.items[self.a.pk]
        with school_context(self.a.pk):
            SchoolSettings.objects.create(school_name='A',allow_teacher_attendance_retake=True)
        payload={'records':[{'student':own['students'].pk,'school_class':own['classes'].pk,'attendance_date':str(timezone.localdate()),'status':'Present'}],'expected_revision':0}
        first=self.client.post('/api/attendance/',payload,format='json')
        self.assertEqual(first.status_code,201,first.data)
        self.assertEqual(first.data['session']['actor_identifier'],self.admin.username)
        self.use(self.login(self.teacher_user),self.a)
        loaded=self.client.get(f'/api/attendance-session/?school_class={own["classes"].pk}&date={timezone.localdate()}')
        self.assertEqual(loaded.data['session']['revision'],1)
        payload.update(expected_revision=1,reason='Corrected a late arrival')
        payload['records'][0]['status']='Late'
        saved=self.client.post('/api/attendance/',payload,format='json')
        self.assertEqual(saved.status_code,201,saved.data)
        self.assertEqual(saved.data['session']['actor_identifier'],'T-001')
        self.assertEqual(saved.data['session']['revision'],2)
        self.assertEqual(self.client.post('/api/attendance/',payload,format='json').status_code,409)
        with school_context(self.a.pk):
            self.assertEqual(AttendanceRevision.objects.count(),2)
            self.assertEqual(AttendanceRevision.objects.get(revision=1).actor_role,'admin')
            SchoolSettings.objects.update(allow_teacher_attendance_retake=False)
        payload['expected_revision']=2
        self.assertEqual(self.client.post('/api/attendance/',payload,format='json').status_code,403)
        self.use(self.tokens,self.a)
        self.assertEqual(self.client.post('/api/attendance/',payload,format='json').status_code,201)

    def test_curriculum_sections_and_monthly_invoice_duplicates(self):
        curriculum=self.client.get('/api/curriculum/')
        self.assertEqual(len(curriculum.data['grades']),12)
        self.assertIn('Physics',curriculum.data['grades'][11]['subjects'])
        for section in ('A','B'):
            result=self.client.post('/api/classes/',{'name':f'Class 1 {section}','grade':'1','section':section,'academic_year':'2026'},format='json')
            self.assertEqual(result.status_code,201,result.data)
            self.assertIn('Mathematics',result.data['subjects'])
        self.assertEqual(self.client.post('/api/classes/',{'name':'Invalid','grade':'13'},format='json').status_code,400)
        payload={'student':self.items[self.a.pk]['students'].pk,'amount':'1500','billing_period':'2026-10','due_date':'2026-10-10'}
        first=self.client.post('/api/fees/',payload,format='json')
        self.assertEqual(first.status_code,201,first.data)
        self.assertEqual(self.client.post('/api/fees/',payload,format='json').status_code,400)
        statement=self.client.get(f'/api/students/{payload["student"]}/statement/')
        self.assertEqual(statement.status_code,200)
        self.assertEqual(len(statement.data['invoices']),2)
        self.assertEqual(self.client.get(f'/api/students/{self.items[self.b.pk]["students"].pk}/statement/').status_code,404)
        self.use(self.login(self.teacher_user),self.a)
        self.assertEqual(self.client.get('/api/finance-summary/').status_code,403)

    def test_notifications_are_personal_and_remain_school_scoped(self):
        with school_context(self.a.pk):
            own=Notification.objects.create(recipient=self.admin,event_key='own',title='Own',message='Private',section='fees')
            other=Notification.objects.create(recipient=self.teacher_user,event_key='teacher',title='Other',message='Private',section='attendance',school_class=self.items[self.a.pk]['classes'])
        response=self.client.get('/api/notifications/')
        ids=[r['id'] for r in response.data['results']]
        self.assertIn(own.pk,ids);self.assertNotIn(other.pk,ids)
        self.assertEqual(self.client.post('/api/notifications/',{'id':other.pk},format='json').status_code,404)
        self.assertEqual(self.client.post('/api/notifications/',{'id':own.pk},format='json').status_code,200)
        self.use(self.login(self.other),self.b)
        self.assertEqual(self.client.post('/api/notifications/',{'id':own.pk},format='json').status_code,404)

    def test_payment_retry_returns_original_receipt_without_double_collection(self):
        import uuid
        payload={'fee':self.items[self.a.pk]['fees'].pk,'amount':'10.00','payment_date':str(timezone.localdate()),'payment_method':'Cash','request_id':str(uuid.uuid4())}
        first=self.client.post('/api/fee-payments/',payload,format='json')
        second=self.client.post('/api/fee-payments/',payload,format='json')
        self.assertEqual(first.status_code,201,first.data)
        self.assertEqual(second.status_code,200,second.data)
        self.assertEqual(first.data['id'],second.data['id'])
        payload['amount']='11.00'
        self.assertEqual(self.client.post('/api/fee-payments/',payload,format='json').status_code,409)


# The base fixture supplies setup/helpers; keep inherited isolation tests in their own suite.
for _name in list(vars(test_isolation.SchoolIsolationTests)):
    if _name.startswith('test_'):
        setattr(ClassroomWorkflowTests,_name,None)
