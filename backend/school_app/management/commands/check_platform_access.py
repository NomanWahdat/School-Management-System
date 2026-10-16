from django.core.management.base import BaseCommand
from school_app.models import User


class Command(BaseCommand):
    help = 'Report whether an active platform administrator exists (no account data printed).'

    def handle(self, *args, **options):
        available = User.objects.filter(is_superuser=True, is_active=True).exists()
        self.stdout.write('Active platform administrator available.' if available else 'No active platform administrator. Run createsuperuser to create one; school admins do not gain platform privileges automatically.')
