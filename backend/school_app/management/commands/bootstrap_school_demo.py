"""One-time server-side demo bootstrap; passwords arrive only through backend secrets."""
import json
import os

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction

from school_app.models import AuditEvent, Membership, School, Teacher, User
from school_app.tenancy import school_context


class Command(BaseCommand):
    help = 'Bootstrap the authorized Kabul School demo from SCHOOL_DEMO_ACCOUNTS; existing passwords remain unchanged.'

    def handle(self, *args, **options):
        try:
            accounts = json.loads(os.environ.get('SCHOOL_DEMO_ACCOUNTS', '{}'))
        except json.JSONDecodeError:
            raise CommandError('SCHOOL_DEMO_ACCOUNTS must be a valid JSON object.')
        expected = {'kabul-admin', 'kabul-teacher', 'platform-owner'}
        if not isinstance(accounts, dict) or set(accounts) != expected:
            raise CommandError('Supply the three explicitly authorized demo account names.')
        for username, password in accounts.items():
            if not isinstance(password, str):
                raise CommandError('Each demo account needs a private password string.')
            try:
                validate_password(password, User(username=username))
            except ValidationError:
                raise CommandError('Each demo account needs a strong private password.')
        with transaction.atomic():
            for username, password in accounts.items():
                user, created = User.objects.get_or_create(username=username, defaults={
                    'first_name':'Kabul Demo', 'last_name':{'kabul-admin':'Administrator','kabul-teacher':'Teacher','platform-owner':'Platform Owner'}[username],
                    'is_superuser':username == 'platform-owner', 'is_staff':username == 'platform-owner', 'must_change_password':True,
                })
                if created:
                    user.set_password(password)
                    user.save(update_fields=['password'])
                    AuditEvent.objects.create(actor=user, action='authorized_demo_account_created', target=username)
                if not user.is_active or (username == 'platform-owner') != user.is_superuser:
                    raise CommandError('An existing demo username has incompatible access. No privileges were changed.')
            call_command('create_school_demo', admin='platform-owner', name='Kabul School', slug='kabul-school')
            school = School.objects.get(slug='kabul-school')
            with school_context(school.pk):
                for username, role in [('kabul-admin','admin'), ('kabul-teacher','teacher')]:
                    user = User.objects.get(username=username)
                    membership, _ = Membership.objects.get_or_create(user=user, school=school, defaults={'role':role})
                    if not membership.is_active or membership.role != role:
                        raise CommandError('An existing demo membership has incompatible access.')
                teacher = User.objects.get(username='kabul-teacher')
                profile = Teacher.objects.filter(user=teacher).first()
                if not profile:
                    profile = Teacher.objects.filter(subject='Mathematics', user__isnull=True).order_by('pk').first()
                    if not profile:
                        raise CommandError('No Mathematics demo teacher is available for the authorized account.')
                    profile.user = teacher
                    profile.save(update_fields=['user'])
        self.stdout.write(self.style.SUCCESS('Kabul School bootstrap complete. Existing passwords preserved; new users must change their temporary passwords.'))
