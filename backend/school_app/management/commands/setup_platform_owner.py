import getpass

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from school_app.models import User, AuditEvent


class Command(BaseCommand):
    help = 'Explicitly initialize a separate platform owner; passwords are entered privately in the terminal.'

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True)
        parser.add_argument('--existing', action='store_true', help='Explicitly promote this existing account; other accounts are untouched.')

    def handle(self, *args, **options):
        username = options['username'].strip()
        if not username or len(username) > 150:
            raise CommandError('Choose a username between 1 and 150 characters.')
        user = User.objects.filter(username=username).first()
        if options['existing']:
            if not user or not user.is_active:
                raise CommandError('An active existing account with this exact username is required.')
            with transaction.atomic():
                user = User.objects.select_for_update().get(pk=user.pk)
                user.is_superuser = True
                user.is_staff = True
                user.must_change_password = True
                user.session_version += 1
                user.save(update_fields=['is_superuser', 'is_staff', 'must_change_password', 'session_version'])
                AuditEvent.objects.create(actor=user, action='platform_owner_explicitly_promoted', target=f'user:{user.pk}')
            self.stdout.write(self.style.SUCCESS('Explicit platform promotion completed. Sign in and change your password; old sessions have ended.'))
            return
        if user:
            raise CommandError('That username already exists. Choose a separate owner username, or explicitly use --existing.')
        password = getpass.getpass('New platform owner password: ')
        confirmation = getpass.getpass('Confirm password: ')
        if password != confirmation:
            raise CommandError('Passwords did not match. Nothing changed.')
        candidate = User(username=username)
        try:
            validate_password(password, candidate)
        except ValidationError as exc:
            raise CommandError(' '.join(exc.messages))
        with transaction.atomic():
            user = User.objects.create_superuser(username=username, password=password)
            AuditEvent.objects.create(actor=user, action='platform_owner_created', target=f'user:{user.pk}')
        self.stdout.write(self.style.SUCCESS('Platform owner created. Sign in to open Platform administration. No school account privileges were changed.'))
