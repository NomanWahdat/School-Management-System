from decimal import Decimal

from django.core.cache import cache
from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APIClient

from .models import (School, User, Membership, AuditEvent, SchoolClass, Student, Teacher,
                     Attendance, Exam, Result, Fee, FeePayment, Homework, Announcement, Guardian, Enrollment)
from .tenancy import school_context


class SchoolIsolationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.a = School.objects.create(name='School A', slug='school-a')
        self.b = School.objects.create(name='School B', slug='school-b')
        self.admin = User.objects.create_user(username='admin-a', password='School-review-2026')
        self.other = User.objects.create_user(username='admin-b', password='School-review-2026')
        self.teacher_user = User.objects.create_user(username='teacher-a', password='School-review-2026', role='admin')
        self.platform = User.objects.create_superuser(username='platform', password='School-review-2026')
        self.ma = Membership.objects.create(user=self.admin, school=self.a, role='admin')
        Membership.objects.create(user=self.other, school=self.b, role='admin')
        self.mt = Membership.objects.create(user=self.teacher_user, school=self.a, role='teacher')
        self.items = {}
        for school, actor in [(self.a, self.admin), (self.b, self.other)]:
            with school_context(school.pk):
                cls = SchoolClass.objects.create(name=f'{school.name} class', grade='8', academic_year='2026', subjects=['Math', 'Science'])
                student = Student.objects.create(student_id='S-001', name=f'{school.name} student', father_name='Guardian', gender='Male', date_of_birth='2012-01-01', school_class=cls, contact_number='0700000000', address='Kabul')
                teacher = Teacher.objects.create(teacher_id='T-001', name='Teacher', subject='Math', user=self.teacher_user if school == self.a else None)
                teacher.assigned_classes.add(cls)
                exam = Exam.objects.create(name=f'{school.name} exam', school_class=cls, subject='Math', subjects=['Math', 'Science'], exam_date=timezone.localdate(), max_marks=100)
                attendance = Attendance.objects.create(student=student, school_class=cls, attendance_date=timezone.localdate(), status='Present', recorded_by=actor)
                result = Result.objects.create(student=student, exam=exam, subject='Math', marks=50, total_marks=100)
                fee = Fee.objects.create(student=student, school_class=cls, amount=Decimal('100'), total_due=Decimal('100'), remaining_amount=Decimal('100'), due_date=timezone.localdate())
                payment = FeePayment.objects.create(fee=fee, amount=Decimal('10'), recorded_by=actor)
                lesson = __import__('school_app.models', fromlist=['TimetableEntry']).TimetableEntry.objects.create(day='Saturday', start_time='08:00', end_time='09:00', school_class=cls, teacher=teacher, subject='Math')
                homework = Homework.objects.create(title=f'{school.name} task', description='Read chapter', school_class=cls, subject='Math', due_date=timezone.localdate(), created_by=actor)
                notice = Announcement.objects.create(title=f'{school.name} notice', content='Meeting', created_by=actor)
                guardian = Guardian.objects.create(student=student, name='Guardian', relationship='Father', phone_number='0700000000')
                enrollment = Enrollment.objects.create(student=student, school_class=cls, academic_year='2026')
                self.items[school.pk] = {'classes': cls, 'students': student, 'teachers': teacher, 'exams': exam, 'attendance': attendance, 'results': result, 'fees': fee, 'fee-payments': payment, 'timetable': lesson, 'homework': homework, 'announcements': notice, 'guardians': guardian, 'enrollments': enrollment}
        self.client = APIClient()
        self.tokens = self.login(self.admin)
        self.use(self.tokens, self.a)

    def login(self, user):
        client = APIClient()
        response = client.post('/api/login/', {'username': user.username, 'password': 'School-review-2026'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def use(self, tokens, school=None):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + tokens['access'], **({'HTTP_X_SCHOOL_ID': str(school.pk)} if school else {}))

    def test_every_list_search_and_page_is_school_scoped(self):
        for endpoint, own in self.items[self.a.pk].items():
            with self.subTest(endpoint=endpoint):
                response = self.client.get(f'/api/{endpoint}/')
                self.assertEqual(response.status_code, 200)
                self.assertEqual([r['id'] for r in response.data], [own.pk])
                page = self.client.get(f'/api/{endpoint}/?page=1')
                self.assertEqual(page.data['count'], 1)
                self.assertNotIn(self.items[self.b.pk][endpoint].pk, [r['id'] for r in page.data['results']])
        result = self.client.get('/api/students/?search=School%20B')
        self.assertEqual(result.data, [])

    def test_cross_school_detail_update_delete_never_discloses_records(self):
        for endpoint, other in self.items[self.b.pk].items():
            if endpoint in ('fee-payments', 'enrollments'):
                continue
            for method in ['get', 'patch', 'delete']:
                with self.subTest(endpoint=endpoint, method=method):
                    response = getattr(self.client, method)(f'/api/{endpoint}/{other.pk}/', {} if method == 'patch' else None, format='json')
                    self.assertEqual(response.status_code, 404, response.data)

    def test_dashboard_reports_followup_and_settings_do_not_leak(self):
        dashboard = self.client.get('/api/dashboard/').data
        self.assertEqual(dashboard['student_count'], 1)
        self.assertEqual(Decimal(str(dashboard['outstanding_balance'])), Decimal('90'))
        for mode in ['students', 'attendance', 'results', 'fees', 'teachers']:
            response = self.client.get(f'/api/reports/?report={mode}')
            self.assertEqual(response.status_code, 200)
            self.assertNotIn('School B', str(response.data))
        self.assertEqual(self.client.get('/api/reports/?report=students&class=' + str(self.items[self.b.pk]['classes'].pk)).status_code, 400)
        self.assertNotIn('School B', str(self.client.get('/api/follow-up/').data))
        self.assertEqual(self.client.get('/api/school-context/').data['school']['id'], self.a.pk)

    def test_foreign_key_payloads_and_school_ownership_are_rejected(self):
        a, b = self.items[self.a.pk], self.items[self.b.pk]
        cases = [
            ('students', {'student_id': 'NEW', 'name': 'Student', 'father_name': 'Guardian', 'gender': 'Male', 'date_of_birth': '2012-01-01', 'school_class': b['classes'].pk, 'contact_number': '0700000000', 'address': 'Kabul'}),
            ('attendance', {'student': b['students'].pk, 'school_class': a['classes'].pk, 'attendance_date': str(timezone.localdate()), 'status': 'Present'}),
            ('results', {'student': b['students'].pk, 'exam': a['exams'].pk, 'subject': 'Science', 'marks': 50, 'total_marks': 100}),
            ('fees', {'student': b['students'].pk, 'amount': 100, 'total_due': 100, 'fee_type': 'Other', 'due_date': str(timezone.localdate())}),
            ('fee-payments', {'fee': b['fees'].pk, 'amount': 1}),
            ('timetable', {'teacher': b['teachers'].pk, 'school_class': a['classes'].pk, 'day': 'Monday', 'start_time': '10:00', 'end_time': '11:00', 'subject': 'Math'}),
            ('homework', {'title': 'Task', 'description': 'Read', 'subject': 'Math', 'school_class': b['classes'].pk, 'due_date': str(timezone.localdate())}),
            ('announcements', {'title': 'Notice', 'content': 'Read', 'audience': 'Class', 'school_class': b['classes'].pk}),
            ('guardians', {'student': b['students'].pk, 'name': 'Guardian', 'relationship': 'Father', 'phone_number': '0700000000'}),
        ]
        for endpoint, payload in cases:
            with self.subTest(endpoint=endpoint):
                self.assertIn(self.client.post(f'/api/{endpoint}/', payload, format='json').status_code, [400, 404])
        for key in ['school', 'school_id']:
            self.assertEqual(self.client.post('/api/classes/', {'name': 'Bad ownership', key: self.b.pk}, format='json').status_code, 400)
            self.assertEqual(self.client.patch(f'/api/classes/{a["classes"].pk}/', {key: self.b.pk}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/teachers/', {'teacher_id': 'NEW', 'name': 'Teacher', 'phone_number': '0700000000', 'subject': 'Math', 'assigned_classes': [a['classes'].pk, b['classes'].pk]}, format='json').status_code, 400)

    def test_missing_school_and_forged_school_header_fail_closed(self):
        Membership.objects.create(user=self.admin, school=self.b, role='admin')
        unscoped = self.login(self.admin)
        self.use(unscoped)
        self.assertEqual(self.client.get('/api/students/').status_code, 403)
        self.use(self.tokens, self.b)
        self.assertEqual(self.client.get('/api/students/').status_code, 409)
        self.use(self.tokens, self.a)
        self.assertEqual(self.client.get('/api/students/').status_code, 200)
        self.client.credentials()
        self.assertEqual(self.client.get('/api/students/').status_code, 401)
        with self.assertRaises(PermissionDenied):
            Student.objects.count()

    def test_suspension_revocation_and_role_changes_invalidate_existing_sessions(self):
        self.ma.is_active = False; self.ma.save()
        self.assertEqual(self.client.get('/api/students/').status_code, 401)
        self.assertEqual(APIClient().post('/api/token/refresh/', {'refresh': self.tokens['refresh']}, format='json').status_code, 401)
        self.ma.is_active = True; self.ma.version += 1; self.ma.save()
        self.assertEqual(self.client.get('/api/students/').status_code, 401)
        tokens = self.login(self.admin); self.use(tokens, self.a)
        self.a.is_active = False; self.a.save()
        self.assertEqual(self.client.get('/api/students/').status_code, 401)
        self.assertEqual(APIClient().post('/api/token/refresh/', {'refresh': tokens['refresh']}, format='json').status_code, 401)

    def test_logout_all_and_password_reset_invalidate_refresh_tokens(self):
        self.assertEqual(self.client.post('/api/logout-all/', {}, format='json').status_code, 200)
        self.assertEqual(self.client.get('/api/students/').status_code, 401)
        self.assertEqual(APIClient().post('/api/token/refresh/', {'refresh': self.tokens['refresh']}, format='json').status_code, 401)
        tokens = self.login(self.admin); self.use(tokens, self.a)
        changed = self.client.post('/api/change-password/', {'current_password': 'School-review-2026', 'new_password': 'Another-review-password-2026'}, format='json')
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(APIClient().post('/api/token/refresh/', {'refresh': tokens['refresh']}, format='json').status_code, 401)

    def test_refresh_rotates_and_reuse_is_rejected(self):
        client = APIClient()
        response = client.post('/api/token/refresh/', {'refresh': self.tokens['refresh']}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.data['refresh'], self.tokens['refresh'])
        self.assertEqual(client.post('/api/token/refresh/', {'refresh': self.tokens['refresh']}, format='json').status_code, 401)
        self.use(response.data, self.a)
        self.assertEqual(self.client.get('/api/students/').status_code, 200)

    def test_school_switch_binds_new_tokens_and_old_form_header_is_rejected(self):
        Membership.objects.create(user=self.admin, school=self.b, role='teacher')
        with school_context(self.b.pk):
            teacher = Teacher.objects.create(teacher_id='T-002', name='Shared teacher', user=self.admin, subject='Math')
            teacher.assigned_classes.add(self.items[self.b.pk]['classes'])
        switched = self.client.post('/api/schools/', {'school_id': self.b.pk}, format='json')
        self.assertEqual(switched.status_code, 200)
        self.assertEqual(switched.data['user']['role'], 'teacher')
        self.use(switched.data, self.a)
        self.assertEqual(self.client.post('/api/attendance/', [], format='json').status_code, 409)
        self.use(switched.data, self.b)
        self.assertEqual([row['id'] for row in self.client.get('/api/students/').data], [self.items[self.b.pk]['students'].pk])
        self.assertTrue(AuditEvent.objects.filter(actor=self.admin, school=self.b, action='school_switch').exists())

    def test_users_cannot_select_another_school_or_gain_platform_privileges(self):
        self.assertEqual(self.client.post('/api/schools/', {'school_id': self.b.pk}, format='json').status_code, 404)
        self.assertEqual(self.client.get('/api/platform/schools/').status_code, 403)
        for payload in [{'role': 'admin'}, {'is_superuser': True}, {'is_staff': True}, {'school_id': self.b.pk}]:
            self.assertEqual(self.client.patch('/api/profile/', payload, format='json').status_code, 400)
        self.admin.refresh_from_db(); self.assertFalse(self.admin.is_superuser)

    def test_platform_requires_explicit_school_access_and_audits_it(self):
        tokens = self.login(self.platform); self.use(tokens)
        self.assertEqual(self.client.get('/api/platform/schools/').status_code, 200)
        self.assertEqual(self.client.get('/api/students/').status_code, 403)
        opened = self.client.post(f'/api/platform/schools/{self.a.pk}/access/', {}, format='json')
        self.assertEqual(opened.status_code, 200)
        self.use(opened.data, self.a)
        self.assertEqual([row['id'] for row in self.client.get('/api/students/').data], [self.items[self.a.pk]['students'].pk])
        self.assertEqual(self.client.get(f'/api/students/{self.items[self.b.pk]["students"].pk}/').status_code, 404)
        self.assertTrue(AuditEvent.objects.filter(actor=self.platform, school=self.a, action='platform_school_access').exists())

    def test_teacher_permissions_use_membership_not_legacy_global_role(self):
        tokens = self.login(self.teacher_user); self.use(tokens, self.a)
        self.assertEqual(tokens['user']['role'], 'teacher')
        for endpoint in ['teachers', 'fees', 'fee-payments', 'settings', 'reports', 'dashboard', 'audit']:
            with self.subTest(endpoint=endpoint): self.assertEqual(self.client.get(f'/api/{endpoint}/').status_code, 403)
        self.assertEqual(self.client.post('/api/exams/', {}, format='json').status_code, 403)
        self.assertEqual(self.client.post('/api/homework/', {'title': 'Math practice', 'description': 'Read', 'school_class': self.items[self.a.pk]['classes'].pk, 'subject': 'Math', 'due_date': str(timezone.localdate())}, format='json').status_code, 201)
        self.assertEqual(self.client.post('/api/homework/', {'title': 'Science practice', 'description': 'Read', 'school_class': self.items[self.a.pk]['classes'].pk, 'subject': 'Science', 'due_date': str(timezone.localdate())}, format='json').status_code, 400)

    def test_teacher_cannot_move_attendance_or_results_to_an_unassigned_class(self):
        with school_context(self.a.pk):
            other_class = SchoolClass.objects.create(name='Unassigned', subjects=['Math'])
            student = Student.objects.create(student_id='S-002', name='Unassigned', father_name='Guardian', gender='Male', date_of_birth='2012-01-01', school_class=other_class, contact_number='0700000000', address='Kabul')
            exam = Exam.objects.create(name='Unassigned', school_class=other_class, subject='Math', subjects=['Math'], exam_date=timezone.localdate())
        self.use(self.login(self.teacher_user), self.a)
        self.assertEqual(self.client.patch(f'/api/attendance/{self.items[self.a.pk]["attendance"].pk}/', {'student': student.pk, 'school_class': other_class.pk}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(f'/api/results/{self.items[self.a.pk]["results"].pk}/', {'student': student.pk, 'exam': exam.pk, 'subject': 'Math'}, format='json').status_code, 400)
        self.assertNotIn(student.pk, [r['id'] for r in self.client.get('/api/students/').data])

    def test_forced_password_change_is_enforced_by_api(self):
        self.admin.must_change_password = True; self.admin.save()
        self.assertEqual(self.client.get('/api/students/').status_code, 403)
        self.assertEqual(self.client.post('/api/schools/', {'school_id': self.a.pk}, format='json').status_code, 403)
        self.assertEqual(self.client.get('/api/profile/').status_code, 200)

    def test_bulk_attendance_is_atomic_validated_and_retry_safe(self):
        own = self.items[self.a.pk]
        good = {'student': own['students'].pk, 'school_class': own['classes'].pk, 'attendance_date': str(timezone.localdate()), 'status': 'Absent'}
        bad = {**good, 'student': self.items[self.b.pk]['students'].pk}
        self.assertEqual(self.client.post('/api/attendance/', [good, bad], format='json').status_code, 400)
        own['attendance'].refresh_from_db(); self.assertEqual(own['attendance'].status, 'Present')
        self.assertEqual(self.client.post('/api/attendance/', [{**good, 'status': 'Invalid'}], format='json').status_code, 400)
        for _ in range(2): self.assertEqual(self.client.post('/api/attendance/', [good], format='json').status_code, 201)
        self.assertEqual(Attendance.all_objects.filter(school=self.a).count(), 1)
        own['attendance'].refresh_from_db(); self.assertEqual(own['attendance'].status, 'Absent'); self.assertEqual(own['attendance'].recorded_by_id, self.admin.pk)

    def test_bulk_results_are_atomic(self):
        own = self.items[self.a.pk]
        good = {'student': own['students'].pk, 'exam': own['exams'].pk, 'subject': 'Math', 'marks': 80, 'total_marks': 100}
        bad = {**good, 'student': self.items[self.b.pk]['students'].pk}
        self.assertEqual(self.client.post('/api/results/bulk/', [good, bad], format='json').status_code, 400)
        own['results'].refresh_from_db(); self.assertEqual(own['results'].marks, 50)
        self.assertEqual(self.client.post('/api/results/bulk/', [good], format='json').status_code, 200)
        own['results'].refresh_from_db(); self.assertEqual(own['results'].grade, 'B')

    def test_fee_update_recalculates_and_paid_history_cannot_be_deleted(self):
        fee = self.items[self.a.pk]['fees']
        response = self.client.patch(f'/api/fees/{fee.pk}/', {'amount': '150.00', 'total_due': '150.00'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        fee.refresh_from_db(); self.assertEqual(fee.remaining_amount, Decimal('140'))
        self.assertEqual(self.client.delete(f'/api/fees/{fee.pk}/').status_code, 400)
        self.assertEqual(self.client.post('/api/fee-payments/', {'fee': fee.pk, 'amount': '141.00'}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/fee-payments/', {'fee': fee.pk, 'amount': '140.00'}, format='json').status_code, 201)
        self.assertEqual(self.client.post('/api/fee-payments/', {'fee': fee.pk, 'amount': '1.00'}, format='json').status_code, 400)

    def test_timetable_conflicts_checked_across_classes_and_on_update(self):
        from .models import TimetableEntry
        own = self.items[self.a.pk]
        with school_context(self.a.pk):
            cls = SchoolClass.objects.create(name='Another', subjects=['Math'])
            own['teachers'].assigned_classes.add(cls)
            lesson = TimetableEntry.objects.create(day='Monday', start_time='08:00', end_time='09:00', school_class=cls, teacher=own['teachers'], subject='Math')
        payload = {'day': 'Saturday', 'start_time': '08:30', 'end_time': '09:30', 'school_class': cls.pk, 'teacher': own['teachers'].pk, 'subject': 'Math'}
        self.assertEqual(self.client.post('/api/timetable/', payload, format='json').status_code, 400)
        self.assertEqual(self.client.patch(f'/api/timetable/{lesson.pk}/', payload, format='json').status_code, 400)

    def test_announcement_author_set_server_side(self):
        response = self.client.post('/api/announcements/', {'title': 'New notice', 'content': 'Read', 'created_by': self.other.pk}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['created_by'], self.admin.pk)

    def test_receipts_report_cards_csv_and_branding_are_scoped(self):
        own, other = self.items[self.a.pk], self.items[self.b.pk]
        self.assertEqual(self.client.get(f'/api/students/{other["students"].pk}/report-card/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/fee-payments/{other["fee-payments"].pk}/receipt/').status_code, 404)
        card = self.client.get(f'/api/students/{own["students"].pk}/report-card/'); self.assertEqual(card.status_code, 200); self.assertEqual(card.data['school']['id'], self.a.pk)
        receipt = self.client.get(f'/api/fee-payments/{own["fee-payments"].pk}/receipt/'); self.assertEqual(receipt.status_code, 200); self.assertTrue(receipt.data['receipt_number'].startswith('SCHOOL-A-'))
        csv = self.client.get('/api/reports/?report=students&format=csv'); self.assertEqual(csv.status_code, 200); self.assertNotIn(b'School B', csv.content); self.assertEqual(csv['Cache-Control'], 'private, no-store')
        public = APIClient().get('/api/school-branding/?slug=school-a'); self.assertEqual(set(public.data), {'school_name', 'slug', 'logo', 'appearance'})

    def test_database_guards_reject_raw_bulk_and_m2m_cross_school_writes(self):
        own, other = self.items[self.a.pk], self.items[self.b.pk]
        for action in [lambda: Student.all_objects.filter(pk=own['students'].pk).update(school_class=other['classes']), lambda: own['teachers'].assigned_classes.add(other['classes']), lambda: Student.all_objects.filter(pk=own['students'].pk).update(school=self.b)]:
            with self.subTest(action=action):
                with self.assertRaises(IntegrityError), transaction.atomic(): action()
        with self.assertRaises(IntegrityError), transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute('UPDATE school_app_attendance SET student_id=%s WHERE id=%s', [other['students'].pk, own['attendance'].pk])

    def test_explicit_job_context_is_isolated_and_resets(self):
        for school in [self.a, self.b]:
            with school_context(school.pk):
                self.assertEqual(Student.objects.get().school_id, school.pk)
        with self.assertRaises(PermissionDenied): Student.objects.count()

    def test_promotion_preserves_historical_records(self):
        own = self.items[self.a.pk]
        with school_context(self.a.pk): dest = SchoolClass.objects.create(name='Next year', academic_year='2027', subjects=['Math'])
        response = self.client.post('/api/promotions/', {'from_class': own['classes'].pk, 'to_class': dest.pk, 'students': [own['students'].pk]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        own['students'].refresh_from_db(); self.assertEqual(own['students'].school_class_id, dest.pk)
        own['attendance'].refresh_from_db(); self.assertEqual(own['attendance'].school_class_id, own['classes'].pk)
        self.assertEqual(Enrollment.all_objects.filter(student=own['students']).count(), 2)

    def test_shared_account_cannot_be_reset_by_school_admin(self):
        Membership.objects.create(user=self.teacher_user, school=self.b, role='teacher')
        response = self.client.post(f'/api/teachers/{self.items[self.a.pk]["teachers"].pk}/account/reset-password/', {'temporary_password': 'Another-review-password-2026'}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.patch(f'/api/teachers/{self.items[self.a.pk]["teachers"].pk}/account/', {'is_superuser': True}, format='json').status_code, 400)

    def test_dashboard_attendance_keeps_same_day_promotion_roster(self):
        own = self.items[self.a.pk]
        with school_context(self.a.pk):
            destination = SchoolClass.objects.create(name='Next year', academic_year='2027')
        response = self.client.post('/api/promotions/', {'from_class': own['classes'].pk, 'to_class': destination.pk, 'students': [own['students'].pk]}, format='json')
        self.assertEqual(response.status_code, 200)
        dashboard = self.client.get('/api/dashboard/')
        self.assertEqual(dashboard.status_code, 200, dashboard.data)
        former_class = next(row for row in dashboard.data['today_attendance']['by_class'] if row['class_id'] == own['classes'].pk)
        self.assertEqual((former_class['total'], former_class['expected']), (1, 1))
        with school_context(self.a.pk):
            Result.objects.filter(pk=own['results'].pk).delete()
        self.use(self.login(self.teacher_user), self.a)
        teacher_dashboard = self.client.get('/api/teacher-dashboard/')
        self.assertEqual(teacher_dashboard.status_code, 200, teacher_dashboard.data)
        self.assertEqual(teacher_dashboard.data['pending_results'][0]['total'], 1)

    def test_lazy_school_queries_cannot_escape_their_job_context(self):
        with school_context(self.a.pk):
            query = Student.objects.all()
        with school_context(self.b.pk):
            with self.assertRaises(PermissionDenied): list(query)
            with self.assertRaises(PermissionDenied): query.count()
            with self.assertRaises(PermissionDenied): query.update(name='Wrong school')

    def test_cached_index_and_lazy_iterator_check_consumption_context(self):
        with school_context(self.a.pk):
            query = Student.objects.all()
            list(query)
            pending = Student.objects.all().iterator()
            SchoolClass.objects.create(name='Additional class')
            started = SchoolClass.objects.all().iterator()
            next(started)
        with school_context(self.b.pk):
            with self.assertRaises(PermissionDenied): query[0]
            with self.assertRaises(PermissionDenied): query[:1]
            with self.assertRaises(PermissionDenied): next(pending)
            with self.assertRaises(PermissionDenied): next(started)
        with school_context(None):
            with self.assertRaises(PermissionDenied): next(Student.objects.all().iterator())

    def test_malformed_record_identifiers_return_safe_errors(self):
        for endpoint, payload in [('fee-payments', {'fee': 'invalid', 'amount': 1}), ('promotions', {'from_class': 'invalid', 'to_class': 1, 'students': []}), ('schools', {'school_id': 'invalid'}), ('results/bulk', [{'student': 'invalid', 'exam': 1, 'subject': 'Math'}])]:
            with self.subTest(endpoint=endpoint):
                response = self.client.post(f'/api/{endpoint}/', payload, format='json')
                self.assertEqual(response.status_code, 400)

    def test_login_throttling_is_shared_and_does_not_trust_forwarded_ips(self):
        client = APIClient()
        for ordinal in range(5):
            response = client.post('/api/login/', {'username': 'unknown-account', 'password': 'wrong'}, format='json', REMOTE_ADDR=f'192.0.2.{ordinal}', HTTP_X_FORWARDED_FOR='127.0.0.1')
            self.assertEqual(response.status_code, 401)
        response = APIClient().post('/api/login/', {'username': 'unknown-account', 'password': 'wrong'}, format='json', REMOTE_ADDR='192.0.2.100')
        self.assertEqual(response.status_code, 429)
        self.assertIn('Retry-After', response)

    def test_platform_can_provision_then_suspend_a_school(self):
        self.use(self.login(self.platform))
        response = self.client.post('/api/platform/schools/', {'name': 'School C', 'slug': 'school-c', 'admin_username': 'admin-c', 'admin_password': 'School-review-2026', 'appearance': {'accent': '#345678'}}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        school = School.objects.get(pk=response.data['id'])
        member = Membership.objects.get(school=school)
        self.assertFalse(member.user.is_superuser)
        self.assertTrue(member.user.must_change_password)
        self.assertEqual(member.role, 'admin')
        self.assertTrue(AuditEvent.objects.filter(school=school, action='school_created').exists())
        self.assertEqual(self.client.patch(f'/api/platform/schools/{school.pk}/', {'is_active': False}, format='json').status_code, 200)
        self.assertEqual(APIClient().get('/api/school-branding/?slug=school-c').status_code, 404)

    def test_school_branding_cannot_grant_platform_privileges(self):
        response = self.client.patch('/api/branding/', {'name': 'School A updated', 'appearance': {'accent': '#345678'}}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.client.get('/api/settings/').data['school_name'], 'School A updated')
        self.assertEqual(self.client.patch('/api/branding/', {'is_active': False}, format='json').status_code, 400)
        self.assertEqual(self.client.patch('/api/branding/', {'appearance': {'accent': 'javascript:bad'}}, format='json').status_code, 400)

    def test_membership_deactivation_preserves_shared_global_account(self):
        Membership.objects.create(user=self.teacher_user, school=self.b, role='teacher')
        response = self.client.patch(f'/api/teachers/{self.items[self.a.pk]["teachers"].pk}/account/', {'status': 'Inactive'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.teacher_user.refresh_from_db(); self.assertTrue(self.teacher_user.is_active)
        self.assertTrue(Membership.objects.get(user=self.teacher_user, school=self.b).is_active)

    def test_logos_are_validated_and_stored_under_the_verified_school(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test import override_settings
        from io import BytesIO
        from PIL import Image
        import tempfile
        stream = BytesIO(); Image.new('RGB', (16, 16), '#364e6a').save(stream, format='PNG')
        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media, STORAGES={'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'}, 'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}}):
            response = self.client.patch('/api/settings/', {'logo': SimpleUploadedFile('school.png', stream.getvalue(), content_type='text/html')}, format='multipart')
            self.assertEqual(response.status_code, 200, response.data)
            self.a.refresh_from_db(); self.assertIn(f'schools/{self.a.pk}/branding/', self.a.logo.name)
            bad = self.client.patch('/api/settings/', {'logo': SimpleUploadedFile('bad.png', b'\x89PNG\r\n\x1a\ninvalid-content', content_type='image/png')}, format='multipart')
            self.assertEqual(bad.status_code, 400)
            svg = self.client.patch('/api/settings/', {'logo': SimpleUploadedFile('bad.svg', b'<svg></svg>', content_type='image/svg+xml')}, format='multipart')
            self.assertEqual(svg.status_code, 400)

    def test_historical_exam_roster_survives_promotion(self):
        own = self.items[self.a.pk]
        with school_context(self.a.pk): destination = SchoolClass.objects.create(name='Next year', academic_year='2027')
        self.assertEqual(self.client.post('/api/promotions/', {'from_class': own['classes'].pk, 'to_class': destination.pk, 'students': [own['students'].pk]}, format='json').status_code, 200)
        roster = self.client.get(f'/api/exams/{own["exams"].pk}/roster/')
        self.assertEqual(roster.status_code, 200)
        self.assertIn(own['students'].pk, [row['id'] for row in roster.data])
        self.assertEqual(self.client.get(f'/api/exams/{self.items[self.b.pk]["exams"].pk}/roster/').status_code, 404)

    def test_financial_search_and_csv_formula_escaping(self):
        response = self.client.get('/api/fees/?search=School%20B')
        self.assertEqual(response.data, [])
        with school_context(self.a.pk): Student.objects.filter(pk=self.items[self.a.pk]['students'].pk).update(name='=1+1')
        response = self.client.get('/api/reports/?report=students&format=csv')
        self.assertIn(b"'=1+1", response.content)

    def test_platform_shared_password_reset_revokes_all_school_sessions(self):
        Membership.objects.create(user=self.teacher_user, school=self.b, role='teacher')
        tokens = self.login(self.teacher_user)
        self.use(self.login(self.platform))
        response = self.client.post(f'/api/platform/memberships/{self.mt.pk}/reset-password/', {'temporary_password': 'New-school-password-2026'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(APIClient().post('/api/token/refresh/', {'refresh': tokens['refresh']}, format='json').status_code, 401)
        self.teacher_user.refresh_from_db(); self.assertTrue(self.teacher_user.must_change_password)
        self.assertTrue(AuditEvent.objects.filter(actor=self.platform, action='platform_password_reset', school=self.a).exists())

    def test_invalid_auth_form_shapes_and_password_types_are_safe(self):
        public = APIClient()
        self.assertEqual(public.post('/api/login/', [], format='json').status_code, 400)
        self.assertEqual(public.post('/api/token/refresh/', [], format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/change-password/', {'current_password': [], 'new_password': 'Password-example-2026'}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/promotions/', {'from_class': self.items[self.a.pk]['classes'].pk, 'to_class': self.items[self.b.pk]['classes'].pk, 'students': [{}]}, format='json').status_code, 404)
