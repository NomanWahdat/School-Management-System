from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class LegacyMigrationTests(TransactionTestCase):
    """Exercise the actual migration chain against historical models, including aborts."""
    migrate_from = [('school_app', '0009_user_last_logout_at_alter_announcement_id_and_more')]

    def setUp(self):
        self.executor = MigrationExecutor(connection)
        self.head = self.executor.loader.graph.leaf_nodes('school_app')
        self.executor.migrate(self.migrate_from)
        self.old = self.executor.loader.project_state(self.migrate_from).apps

    def tearDown(self):
        executor = MigrationExecutor(connection)
        # Ambiguity fixture is deliberately fixed before restoring the current schema.
        state = executor.loader.project_state([('school_app', '0010_school_alter_announcement_options_alter_exam_options_and_more')]).apps
        if 'school_app_attendance' in connection.introspection.table_names():
            state.get_model('school_app', 'Attendance').objects.all().delete()
        executor.migrate(self.head)
        super().tearDown()

    def legacy_fixture(self):
        get = lambda name: self.old.get_model('school_app', name)
        admin = get('User').objects.create(username='legacy-admin', role='admin', password='!')
        teacher_user = get('User').objects.create(username='legacy-teacher', role='teacher', password='!')
        cls = get('SchoolClass').objects.create(name='Legacy Class', grade='8', academic_year='2026', subjects=['Math'])
        student = get('Student').objects.create(student_id='LEGACY-1', name='Legacy student', father_name='Guardian', gender='Male', date_of_birth='2012-01-01', school_class=cls, contact_number='0700000000', address='Kabul')
        teacher = get('Teacher').objects.create(user=teacher_user, teacher_id='LEGACY-T', name='Legacy teacher', subject='Math')
        teacher.assigned_classes.add(cls)
        exam = get('Exam').objects.create(name='Legacy exam', school_class=cls, subject='Math', subjects=['Math'], exam_date='2026-01-01')
        result = get('Result').objects.create(student=student, exam=exam, subject='Math', marks=75, total_marks=100)
        attendance = get('Attendance').objects.create(student=student, attendance_date='2026-01-01', status='Present')
        fee = get('Fee').objects.create(student=student, amount='100.00', total_due='100.00', paid_amount='20.00', remaining_amount='80.00', due_date='2026-01-31')
        payment = get('FeePayment').objects.create(fee=fee, amount='20.00', recorded_by=admin)
        get('SchoolSettings').objects.create(school_name='Legacy branding', logo='school/original.png', academic_year='2026')
        return student, teacher, cls, exam, result, attendance, fee, payment

    def test_legacy_records_ids_memberships_branding_and_payments_are_preserved(self):
        fixtures = self.legacy_fixture()
        ids = [row.pk for row in fixtures]
        MigrationExecutor(connection).migrate(self.head)
        from .models import School, Membership, Student, Teacher, SchoolClass, Exam, Result, Attendance, Fee, FeePayment, Enrollment
        school = School.objects.get(slug='existing-school')
        self.assertEqual(school.name, 'Legacy branding')
        self.assertEqual(school.logo.name, 'school/original.png')
        for model, pk in zip([Student, Teacher, SchoolClass, Exam, Result, Attendance, Fee, FeePayment], ids):
            self.assertEqual(model.all_objects.get(pk=pk).school_id, school.pk)
        self.assertEqual(Membership.objects.filter(school=school).count(), 2)
        self.assertEqual(Enrollment.all_objects.filter(student_id=ids[0]).count(), 1)
        self.assertEqual(str(FeePayment.all_objects.get(pk=ids[-1]).amount), '20.00')
        self.assertEqual(Attendance.all_objects.get(pk=ids[5]).school_class_id, ids[2])
        self.assertEqual(Teacher.assigned_classes.through.objects.filter(teacher_id=ids[1], schoolclass_id=ids[2]).count(), 1)

    def test_ambiguous_legacy_relationship_stops_backfill_without_guessing(self):
        student, _, _, _, _, attendance, *_ = self.legacy_fixture()
        cls = self.old.get_model('school_app', 'SchoolClass').objects.create(name='Different class')
        attendance.school_class = cls
        attendance.save()
        with self.assertRaisesRegex(RuntimeError, 'Attendance student/class mismatch'):
            MigrationExecutor(connection).migrate(self.head)
        executor = MigrationExecutor(connection)
        state = executor.loader.project_state([('school_app', '0010_school_alter_announcement_options_alter_exam_options_and_more')]).apps
        self.assertEqual(state.get_model('school_app', 'School').objects.count(), 0)
        self.assertEqual(state.get_model('school_app', 'Student').objects.get(pk=student.pk).school_id, None)

    def test_existing_teaching_week_is_preserved_including_friday(self):
        _, teacher, cls, *_ = self.legacy_fixture()
        self.old.get_model('school_app', 'TimetableEntry').objects.create(teacher=teacher, school_class=cls, day='Friday', start_time='08:00', end_time='09:00', subject='Math')
        MigrationExecutor(connection).migrate(self.head)
        from .models import SchoolSettings
        self.assertEqual(SchoolSettings.all_objects.get().teaching_days, ['Friday'])
