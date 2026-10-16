from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from school_app.models import School, Membership, SchoolClass, Student, Teacher, AuditEvent
from school_app.tenancy import school_context


class Command(BaseCommand):
    help = 'Add school-scoped sample records to an empty workspace. Never delete existing records or users.'

    def add_arguments(self, parser):
        parser.add_argument('--school', required=True, help='School slug')
        parser.add_argument('--actor', required=True, help='Authorized school admin username')

    @transaction.atomic
    def handle(self, *args, **options):
        member = Membership.objects.select_related('school', 'user').filter(school__slug=options['school'], school__is_active=True, user__username=options['actor'], user__is_active=True, role='admin', is_active=True).first()
        if not member:
            raise CommandError('An active school admin membership is required.')
        with school_context(member.school_id):
            School.objects.select_for_update().get(pk=member.school_id)
            if Student.objects.exists() or Teacher.objects.exists() or SchoolClass.objects.exists():
                raise CommandError('This workspace is not empty. No records were changed.')
            for grade in range(1, 11):
                cls = SchoolClass.objects.create(name=f'Class {grade}', grade=str(grade), academic_year='2026', subjects=['Mathematics', 'English', 'Science'])
                teacher = Teacher.objects.create(teacher_id=f'DEMO-T-{grade:03d}', name=f'Sample Teacher {grade}', phone_number='0700000000', subject='Mathematics')
                teacher.assigned_classes.add(cls)
                for ordinal in range(1, 11):
                    Student.objects.create(student_id=f'DEMO-{grade:02d}-{ordinal:02d}', name=f'Sample Student {grade}-{ordinal}', father_name='Sample Guardian', gender='Female' if ordinal % 2 else 'Male', date_of_birth='2014-01-01', school_class=cls, contact_number='0700000000', address='Sample address')
            AuditEvent.objects.create(actor=member.user, school=member.school, action='demo_records_created', target='10-classes:10-teachers:100-students')
        self.stdout.write(self.style.SUCCESS('Sample records added to the selected school. No login passwords were created.'))
