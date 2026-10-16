from django.core.exceptions import ValidationError as ModelValidationError
from django.db import IntegrityError
from django.db.models.deletion import ProtectedError
from rest_framework.exceptions import ValidationError
from rest_framework.views import exception_handler

MESSAGES = {
    'This field is required.': ('این بخش ضروری است.', 'دا ځای اړین دی.'),
    'This field may not be blank.': ('این بخش را خالی نگذارید.', 'دا ځای تش مه پرېږدئ.'),
    'A valid number is required.': ('یک عدد معتبر وارد کنید.', 'سمه شمېره ولیکئ.'),
    'Choose a valid record.': ('یک سابقه معتبر انتخاب کنید.', 'سم ریکارډ وټاکئ.'),
    'Current password is incorrect.': ('رمز فعلی نادرست است.', 'اوسنی پټ نوم ناسم دی.'),
    'You are not assigned to this class.': ('این صنف به شما سپرده نشده است.', 'دا ټولګی تاسو ته نه دی ټاکل شوی.'),
    'Choose an assigned class and subject.': ('صنف و مضمون مربوط خود را انتخاب کنید.', 'خپل ټاکل شوی ټولګی او مضمون وټاکئ.'),
    'School administrator access is required.': ('دسترسی مدیر مکتب ضروری است.', 'د ښوونځي مدیر لاسرسی اړین دی.'),
    'Schedule conflict: this teacher or class already has a lesson at that time.': ('تداخل تقسیم اوقات: استاد یا صنف در این وقت درس دارد.', 'د مهال‌وېش ټکر: ښوونکی یا ټولګی په دې وخت کې درس لري.'),
    'Student must be active and enrolled in the selected class.': ('شاگرد باید فعال و شامل صنف انتخاب‌شده باشد.', 'زده کوونکی باید فعال او په ټاکل شوي ټولګي کې شامل وي.'),
    'Payment must be positive and cannot exceed the outstanding balance.': ('مبلغ پرداخت باید مثبت و کمتر یا برابر با باقی‌مانده باشد.', 'د تادیې مبلغ باید مثبت او له پاتې مبلغ څخه زیات نه وي.'),
    'Invoices with payments must be preserved. Correct the invoice instead.': ('فیس با سابقه پرداخت باید حفظ شود. مشخصات آن را اصلاح کنید.', 'د تادیې لرونکی فیس باید وساتل شي. معلومات یې سم کړئ.'),
    'Attendance cannot be recorded for a future date.': ('حاضری برای تاریخ آینده ثبت نمی‌شود.', 'د راتلونکې نېټې حاضري نه شي ثبتېدای.'),
    'The school changed. Reopen this form in the active school.': ('مکتب تغییر کرد. فورم را در مکتب فعال دوباره باز کنید.', 'ښوونځی بدل شو. فورم په فعال ښوونځي کې بیا پرانیزئ.'),
    'Change your temporary password before continuing.': ('پیش از ادامه رمز موقت را تغییر دهید.', 'له دوام مخکې لنډمهالی پټ نوم بدل کړئ.'),
    'This session ended. Please sign in again.': ('نشست پایان یافت. دوباره وارد شوید.', 'ناسته پای ته ورسېده. بیا ننوځئ.'),
}


def localized(value, locale):
    if isinstance(value, dict):
        return {key: localized(item, locale) for key, item in value.items()}
    if isinstance(value, list):
        return [localized(item, locale) for item in value]
    message = str(value)
    if message in MESSAGES:
        return MESSAGES[message][0 if locale == 'fa' else 1]
    # Django/DRF already translate standard validators where a catalog exists.
    if any('\u0600' <= char <= '\u06ff' for char in message):
        return value
    return 'معلومات را بررسی کنید و دوباره تلاش کنید.' if locale == 'fa' else 'معلومات وګورئ او بیا هڅه وکړئ.'


def safe_exception_handler(exc, context):
    if isinstance(exc, ModelValidationError):
        exc = ValidationError(getattr(exc, 'message_dict', None) or exc.messages)
    elif isinstance(exc, (IntegrityError, ProtectedError)):
        exc = ValidationError('This change conflicts with saved records. Refresh and check the selected records.')
    response = exception_handler(exc, context)
    if response is not None:
        locale = context['request'].headers.get('Accept-Language', 'en').split(',')[0].split('-')[0]
        if locale in ('fa', 'ps'):
            response.data = localized(response.data, locale)
        response['Cache-Control'] = 'private, no-store'
    return response
