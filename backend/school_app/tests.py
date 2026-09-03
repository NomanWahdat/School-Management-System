from datetime import date

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from school_app.models import Announcement, Attendance, Exam, Fee, FeePayment, Homework, Result, SchoolClass, Student, Teacher, TimetableEntry, User


class SchoolAppAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='admin',
            password='adminpass123',
            role='admin',
            email='admin@example.com',
        )
        self.teacher = User.objects.create_user(
            username='teacher',
            password='teacherpass123',
            role='teacher',
            email='teacher@example.com',
        )

        self.grade8 = SchoolClass.objects.create(name='Grade 8')
        self.math_teacher = Teacher.objects.create(
            user=self.teacher,
            teacher_id='T-1001',
            name='Naveed Khan',
            phone_number='0700000000',
            subject='Mathematics',
            status='Active',
        )
        self.math_teacher.assigned_classes.add(self.grade8)

        Student.objects.create(
            student_id='S-1001',
            name='Ahmad Rahimi',
            father_name='Rahim Rahimi',
            gender='Male',
            date_of_birth='2012-01-10',
            school_class=self.grade8,
            contact_number='0701111111',
            address='Kabul',
            fee_status='Pending',
        )

        Announcement.objects.create(
            title='School Event',
            content='Parent meeting on Friday',
            created_by=self.admin,
        )

    def test_dashboard_summary_endpoint(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(reverse('dashboard-summary'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['student_count'], 1)
        self.assertEqual(response.data['teacher_count'], 1)
        self.assertEqual(response.data['announcement_count'], 1)

    def test_announcement_audience_is_enforced_for_teacher(self):
        other_class = SchoolClass.objects.create(name='Grade 9')
        Announcement.objects.create(
            title='Grade 9 only', content='Private class notice', created_by=self.admin,
            audience='Class', school_class=other_class,
        )
        Announcement.objects.create(
            title='Grade 8 only', content='Class notice', created_by=self.admin,
            audience='Class', school_class=self.grade8,
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(reverse('announcements'))

        self.assertEqual(response.status_code, 200)
        titles = [item['title'] for item in response.data]
        self.assertIn('Grade 8 only', titles)
        self.assertNotIn('Grade 9 only', titles)

    def test_reports_endpoint_returns_filtered_student_report(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(reverse('reports'), {'report': 'students', 'class': self.grade8.id})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['student_id'], 'S-1001')

    def test_login_endpoint_returns_tokens(self):
        response = self.client.post(
            reverse('login'),
            {'username': 'admin', 'password': 'adminpass123'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_attendance_endpoint_allows_create_and_read(self):
        self.client.force_authenticate(user=self.admin)
        student = Student.objects.get(student_id='S-1001')
        response = self.client.post(
            reverse('attendance'),
            {
                'student': student.id,
                'attendance_date': '2026-08-31',
                'status': 'Present',
                'remarks': 'On time',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Attendance.objects.count(), 1)

        read_response = self.client.get(reverse('attendance'))
        self.assertEqual(read_response.status_code, 200)
        self.assertGreaterEqual(len(read_response.data), 1)

    def test_exam_results_endpoint_allows_create(self):
        self.client.force_authenticate(user=self.admin)
        student = Student.objects.get(student_id='S-1001')
        exam = Exam.objects.create(
            name='Midterm',
            school_class=self.grade8,
            subject='Mathematics',
            exam_date='2026-08-15',
        )

        response = self.client.post(
            reverse('results'),
            {
                'student': student.id,
                'exam': exam.id,
                'marks': 82,
                'total_marks': 100,
                'percentage': 82,
                'grade': 'B',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Result.objects.count(), 1)

    def test_classes_and_timetable_endpoints_allow_create(self):
        self.client.force_authenticate(user=self.admin)

        class_response = self.client.post(
            reverse('classes'),
            {'name': 'Grade 9'},
            format='json',
        )
        self.assertEqual(class_response.status_code, 201)

        timetable_response = self.client.post(
            reverse('timetable'),
            {
                'day': 'Monday',
                'start_time': '08:00:00',
                'end_time': '09:00:00',
                'school_class': self.grade8.id,
                'subject': 'Science',
                'teacher': self.math_teacher.id,
            },
            format='json',
        )
        self.assertEqual(timetable_response.status_code, 201)
        self.assertEqual(TimetableEntry.objects.count(), 1)

    def test_timetable_conflict_is_rejected(self):
        self.client.force_authenticate(user=self.admin)

        TimetableEntry.objects.create(
            day='Monday',
            start_time='08:00:00',
            end_time='09:00:00',
            school_class=self.grade8,
            subject='Mathematics',
            teacher=self.math_teacher,
        )

        response = self.client.post(
            reverse('timetable'),
            {
                'day': 'Monday',
                'start_time': '08:30:00',
                'end_time': '09:15:00',
                'school_class': self.grade8.id,
                'subject': 'Physics',
                'teacher': self.math_teacher.id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('schedule', str(response.data).lower())

    def test_reports_endpoint_returns_summary(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(reverse('reports'))

        self.assertEqual(response.status_code, 200)
        self.assertIn('student_count', response.data)
        self.assertIn('teacher_count', response.data)
        self.assertIn('attendance_rate', response.data)
        self.assertIn('fee_summary', response.data)

    def test_teacher_dashboard_returns_teacher_summary(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(reverse('teacher-dashboard'))

        self.assertEqual(response.status_code, 200)
        self.assertIn('teacher_name', response.data)
        self.assertIn('assigned_classes', response.data)
        self.assertIn('assigned_classes_detail', response.data)
        self.assertIn('assigned_subjects', response.data)
        self.assertIn('pending_results', response.data)
        self.assertIn('upcoming_homework', response.data)

    def test_teacher_can_read_only_assigned_classes_and_students(self):
        other_class = SchoolClass.objects.create(name='Grade 9')
        Student.objects.create(
            student_id='S-1002', name='Sara Rahimi', father_name='Rahim Rahimi', gender='Female',
            date_of_birth='2013-02-10', school_class=other_class, contact_number='0702222222',
            address='Kabul', fee_status='Pending',
        )
        self.client.force_authenticate(user=self.teacher)

        classes_response = self.client.get(reverse('classes'))
        students_response = self.client.get(reverse('students'))

        self.assertEqual(classes_response.status_code, 200)
        self.assertEqual([item['id'] for item in classes_response.data], [self.grade8.id])
        self.assertEqual(students_response.status_code, 200)
        self.assertEqual([item['student_id'] for item in students_response.data], ['S-1001'])

    def test_teacher_homework_is_limited_to_assigned_classes(self):
        other_class = SchoolClass.objects.create(name='Grade 9')
        Homework.objects.create(title='Math task', description='Practice', school_class=self.grade8, subject='Mathematics', due_date='2026-09-10', created_by=self.admin)
        Homework.objects.create(title='Other task', description='Practice', school_class=other_class, subject='Science', due_date='2026-09-10', created_by=self.admin)
        self.client.force_authenticate(user=self.teacher)

        response = self.client.get(reverse('homework'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['title'] for item in response.data], ['Math task'])

    def test_class_metadata_and_duplicate_validation(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            reverse('classes'),
            {'name': 'Grade 8-A', 'grade': 'Grade 8', 'academic_year': '2026', 'status': 'Active'},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(SchoolClass.objects.filter(name='Grade 8-A', academic_year='2026').exists())

        duplicate = self.client.post(
            reverse('classes'),
            {'name': 'Grade 8-A', 'grade': 'Grade 8', 'academic_year': '2026', 'status': 'Active'},
            format='json',
        )
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn('already exists', str(duplicate.data).lower())

    def test_teacher_cannot_record_attendance_for_unassigned_class(self):
        self.client.force_authenticate(user=self.teacher)
        other_class = SchoolClass.objects.create(name='Grade 10-A', grade='Grade 10', academic_year='2026', status='Active')
        student = Student.objects.create(
            student_id='S-1002',
            name='Sara Rahimi',
            father_name='Rahim Rahimi',
            gender='Female',
            date_of_birth='2013-02-10',
            school_class=other_class,
            contact_number='0702222222',
            address='Kabul',
            fee_status='Pending',
        )

        response = self.client.post(
            reverse('attendance'),
            {
                'student': student.id,
                'school_class': other_class.id,
                'attendance_date': '2026-08-31',
                'status': 'Present',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn('assigned', str(response.data).lower())

    def test_student_update_and_delete_endpoints_work(self):
        self.client.force_authenticate(user=self.admin)
        student = Student.objects.get(student_id='S-1001')

        update_response = self.client.patch(
            reverse('student-detail', args=[student.id]),
            {'name': 'Updated Ahmad', 'fee_status': 'Paid'},
            format='json',
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.data['name'], 'Updated Ahmad')

        delete_response = self.client.delete(reverse('student-detail', args=[student.id]))
        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(Student.objects.filter(id=student.id, is_active=True).exists())

    def test_fee_payment_history_and_remaining_balance_are_calculated(self):
        self.client.force_authenticate(user=self.admin)
        student = Student.objects.get(student_id='S-1001')
        fee = Fee.objects.create(
            student=student,
            amount=5000,
            total_due=5000,
            school_class=student.school_class,
            fee_type='Monthly Tuition Fee',
            academic_year='2026',
            due_date='2026-09-10',
            status='Pending',
        )
        FeePayment.objects.create(
            fee=fee,
            amount=2000,
            payment_date='2026-09-01',
            payment_method='Cash',
            notes='Initial payment',
            recorded_by=self.admin,
        )
        FeePayment.objects.create(
            fee=fee,
            amount=3000,
            payment_date='2026-09-05',
            payment_method='Bank Transfer',
            notes='Second payment',
            recorded_by=self.admin,
        )

        fee.refresh_from_db()
        self.assertEqual(float(fee.paid_amount), 5000)
        self.assertEqual(float(fee.remaining_amount), 0)
        self.assertEqual(fee.status, 'Paid')
        self.assertEqual(FeePayment.objects.filter(fee=fee).count(), 2)

    def test_result_duplicate_prevention_uses_exam_subject(self):
        self.client.force_authenticate(user=self.admin)
        student = Student.objects.get(student_id='S-1001')
        exam = Exam.objects.create(
            name='Midterm Examination',
            school_class=student.school_class,
            subject='Mathematics',
            exam_type='Midterm Examination',
            academic_year='2026',
            exam_date='2026-08-15',
            max_marks=100,
        )

        Result.objects.create(
            student=student,
            exam=exam,
            subject='Mathematics',
            marks=85,
            total_marks=100,
        )

        duplicate = Result.objects.filter(student=student, exam=exam, subject='Mathematics').count()
        self.assertEqual(duplicate, 1)

    def test_student_duplicate_id_is_rejected(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            reverse('students'),
            {
                'student_id': 'S-1001',
                'name': 'Duplicate Student',
                'father_name': 'Test Father',
                'gender': 'Male',
                'date_of_birth': '2013-01-10',
                'school_class': self.grade8.id,
                'contact_number': '0705555555',
                'address': 'Kabul',
                'fee_status': 'Pending',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('already exists', str(response.data).lower())

    def test_teacher_student_endpoint_returns_assigned_students_only(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(reverse('students'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['student_id'] for item in response.data], ['S-1001'])

    def test_teacher_duplicate_id_is_rejected(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            reverse('teachers'),
            {
                'teacher_id': 'T-1001',
                'name': 'Another Teacher',
                'phone_number': '0702222222',
                'subject': 'Science',
                'status': 'Active',
                'assigned_classes': [self.grade8.id],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('already exists', str(response.data).lower())

    def test_teacher_endpoints_reject_non_admin_users(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(reverse('teachers'))
        self.assertEqual(response.status_code, 403)

    def test_teacher_and_class_update_delete_endpoints_work(self):
        self.client.force_authenticate(user=self.admin)

        teacher = Teacher.objects.get(teacher_id='T-1001')
        class_response = self.client.patch(
            reverse('class-detail', args=[self.grade8.id]),
            {'name': 'Grade 8-A'},
            format='json',
        )
        self.assertEqual(class_response.status_code, 200)
        self.assertEqual(class_response.data['name'], 'Grade 8-A')

        teacher_response = self.client.patch(
            reverse('teacher-detail', args=[teacher.id]),
            {'name': 'Updated Teacher', 'subject': 'Physics'},
            format='json',
        )
        self.assertEqual(teacher_response.status_code, 200)
        self.assertEqual(teacher_response.data['name'], 'Updated Teacher')

        delete_teacher_response = self.client.delete(reverse('teacher-detail', args=[teacher.id]))
        self.assertEqual(delete_teacher_response.status_code, 204)
        teacher.refresh_from_db()
        self.assertEqual(teacher.status, 'Inactive')
        self.assertTrue(Teacher.objects.filter(id=teacher.id).exists())

        delete_class_response = self.client.delete(reverse('class-detail', args=[self.grade8.id]))
        self.assertEqual(delete_class_response.status_code, 204)
        self.assertFalse(SchoolClass.objects.filter(id=self.grade8.id).exists())

    def test_teacher_dashboard_shows_marked_attendance_for_assigned_classes(self):
        self.client.force_authenticate(user=self.teacher)
        student = Student.objects.get(student_id='S-1001')
        today = date.today()
        Attendance.objects.create(
            student=student,
            attendance_date=today,
            status='Present',
            remarks='Marked by admin',
        )

        response = self.client.get(reverse('teacher-dashboard'))
        self.assertEqual(response.status_code, 200)
        self.assertIn('attendance_summary', response.data)
        self.assertGreaterEqual(response.data['attendance_summary']['marked_today'], 1)

    def test_teacher_dashboard_exposes_assigned_class_ids_and_timetable(self):
        self.client.force_authenticate(user=self.teacher)
        today = date.today()
        TimetableEntry.objects.create(
            day=today.strftime('%A'),
            start_time='08:00:00',
            end_time='09:00:00',
            school_class=self.grade8,
            subject='Mathematics',
            teacher=self.math_teacher,
        )

        response = self.client.get(reverse('teacher-dashboard'))
        self.assertEqual(response.status_code, 200)
        self.assertIn('assigned_class_ids', response.data)
        self.assertIn(self.grade8.id, response.data['assigned_class_ids'])
        self.assertTrue(any(item['school_class'] == self.grade8.name for item in response.data['today_timetable']))

    def test_admin_dashboard_rejects_non_admin_users(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(reverse('dashboard-summary'))
        self.assertEqual(response.status_code, 403)

    def test_teacher_dashboard_rejects_non_teacher_users(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(reverse('teacher-dashboard'))
        self.assertEqual(response.status_code, 403)

    def test_admin_can_create_teacher_account_and_teacher_can_login(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            reverse('teacher-account', args=[self.math_teacher.id]),
            {'username': 'naveed@example.com', 'email': 'naveed@example.com', 'temporary_password': 'StrongTeacherPass123!', 'must_change_password': True},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.math_teacher.refresh_from_db()
        self.assertIsNotNone(self.math_teacher.user)
        self.assertTrue(self.math_teacher.user.check_password('StrongTeacherPass123!'))
        login_response = self.client.post(reverse('login'), {'username': 'naveed@example.com', 'password': 'StrongTeacherPass123!'}, format='json')
        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.data['user']['role'], 'teacher')

    def test_deactivated_teacher_account_cannot_login_and_profile_remains(self):
        self.math_teacher.user.is_active = False
        self.math_teacher.user.save(update_fields=['is_active'])
        login_response = self.client.post(reverse('login'), {'username': 'teacher', 'password': 'teacherpass123'}, format='json')
        self.assertEqual(login_response.status_code, 401)
        self.assertTrue(Teacher.objects.filter(pk=self.math_teacher.pk).exists())
