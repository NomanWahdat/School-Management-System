from contextlib import contextmanager
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac
from rest_framework.exceptions import Throttled

from .models import LoginThrottle


@contextmanager
def login_attempt(request, username):
    """Database-backed counters are shared by all workers; never trust forwarded IPs."""
    identities = [('account:' + username.casefold(), 5), ('ip:' + request.META.get('REMOTE_ADDR', ''), 50)]
    with transaction.atomic():
        counters = []
        now = timezone.now()
        for identity, limit in sorted(identities):
            key = salted_hmac('school-login-throttle', identity, algorithm='sha256').hexdigest()
            counter, _ = LoginThrottle.objects.get_or_create(key=key)
            counter = LoginThrottle.objects.select_for_update().get(pk=counter.pk)
            if counter.window_started_at + timedelta(minutes=15) <= now:
                counter.failures = 0
                counter.window_started_at = now
                counter.save(update_fields=['failures', 'window_started_at'])
            if counter.failures >= limit:
                raise Throttled(wait=900, detail='Too many attempts. Try again in 15 minutes.')
            counters.append(counter)
        outcome = {'success': False}
        yield outcome
        for counter in counters:
            counter.failures = 0 if outcome['success'] else counter.failures + 1
            counter.save(update_fields=['failures'])
