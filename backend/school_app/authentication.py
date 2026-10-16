from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Membership


def verify_session(user, token):
    if not user.is_active or token.get('session_version') != user.session_version:
        raise AuthenticationFailed('This session ended. Please sign in again.')
    selected = token.get('school_id')
    if selected is not None:
        membership = Membership.objects.filter(user=user, school_id=selected, is_active=True, school__is_active=True).first()
        if not membership or token.get('membership_version') != membership.version:
            raise AuthenticationFailed('School access was suspended or changed.')


class RevocableJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        verify_session(user, validated_token)
        return user


def issue_tokens(user, membership=None):
    refresh = RefreshToken.for_user(user)
    refresh['session_version'] = user.session_version
    if membership:
        refresh['school_id'] = membership.school_id
        refresh['membership_version'] = membership.version
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}
