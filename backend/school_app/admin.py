from django.contrib import admin

# Ordinary school management uses membership-scoped APIs. Django's global admin
# is reserved for platform operators and never registers school-owned models.
admin.site.has_permission = lambda request: request.user.is_authenticated and request.user.is_active and request.user.is_superuser
