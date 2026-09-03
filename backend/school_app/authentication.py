from datetime import datetime, timezone

from rest_framework_simplejwt.authentication import JWTAuthentication


class RevocableJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        issued_at = validated_token.get('iat')
        if user.last_logout_at and issued_at:
            issued_at_datetime = datetime.fromtimestamp(issued_at, tz=timezone.utc)
            if issued_at_datetime <= user.last_logout_at:
                from rest_framework_simplejwt.exceptions import AuthenticationFailed
                raise AuthenticationFailed('Session revoked. Please sign in again.')
        return user