from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from school_app.models import Membership, Teacher, TimetableEntry, Exam, Announcement, AuditEvent
from school_app.tenancy import school_context


class Command(BaseCommand):
    help = 'Add sample activities only within an explicitly authorized school.'

    def add_arguments(self, parser):
        parser.add_argument('--school', required=True)
        parser.add_argument('--actor', required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        member = Membership.objects.select_related('school', 'user').filter(school__slug=options['school'], school__is_active=True, user__username=options['actor'], user__is_active=True, role='admin', is_active=True).first()
        if not member:
            raise CommandError('An active school admin membership is required.')
        with school_context(member.school_id):
            if TimetableEntry.objects.exists() or Exam.objects.exists() or Announcement.objects.exists():
                raise CommandError('Activities already exist. No records were changed.')
            for teacher in Teacher.objects.filter(status='Active').prefetch_related('assigned_classes'):
                for ordinal, cls in enumerate(teacher.assigned_classes.all()):
                    hour = 8 + ordinal
                    TimetableEntry.objects.create(teacher=teacher, school_class=cls, subject=teacher.subject, day='Saturday', start_time=f'{hour:02d}:00', end_time=f'{hour+1:02d}:00')
                    Exam.objects.create(name='Sample monthly test', school_class=cls, subject=teacher.subject, subjects=[teacher.subject], exam_date=timezone.localdate())
            Announcement.objects.create(title='Welcome to the school workspace', content='This is a sample announcement. Replace it with your school news.', created_by=member.user)
            AuditEvent.objects.create(actor=member.user, school=member.school, action='demo_activities_created')
        self.stdout.write(self.style.SUCCESS('Sample activities added to the selected school only.'))
