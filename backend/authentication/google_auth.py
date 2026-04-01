"""
Google OAuth Authentication

- GoogleAuthView: For applicants. Verifies Google tokens, creates/logs in buksu.edu.ph users.
- StaffGoogleAuthView: For staff/admins. Verifies Google tokens, logs in existing staff accounts.
"""

import requests
import secrets
import string

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import User, Role

ALLOWED_EMAIL_DOMAIN = 'buksu.edu.ph'


class GoogleAuthView(APIView):
    """
    POST /api/auth/google/

    Authenticate or register an applicant via Google OAuth.
    Only buksu.edu.ph email addresses are allowed (verifies BukSU affiliation).

    Request body:
        { "access_token": "<google_oauth_access_token>" }

    Response:
        { "tokens": { "access": "...", "refresh": "..." }, "user": {...}, "is_new": bool }
    """
    permission_classes = []

    def post(self, request):
        access_token = request.data.get('access_token')
        if not access_token:
            return Response(
                {'error': 'access_token is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verify token with Google and get user info
        try:
            google_response = requests.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                headers={'Authorization': f'Bearer {access_token}'},
                timeout=10
            )
            if google_response.status_code != 200:
                return Response(
                    {'error': 'Invalid or expired Google token. Please sign in again.'},
                    status=status.HTTP_401_UNAUTHORIZED
                )
            google_user = google_response.json()
        except requests.RequestException:
            return Response(
                {'error': 'Failed to verify Google token. Check your connection.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        email = google_user.get('email', '')
        email_verified = google_user.get('email_verified', False)

        if not email_verified:
            return Response(
                {'error': 'Google email is not verified.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if not email.endswith(ALLOWED_EMAIL_DOMAIN):
            return Response(
                {
                    'error': (
                        f'Only {ALLOWED_EMAIL_DOMAIN} accounts are allowed. '
                        'Please use your BukSU institutional email.'
                    )
                },
                status=status.HTTP_403_FORBIDDEN
            )

        firstname = google_user.get('given_name', '') or email.split('@')[0]
        lastname = google_user.get('family_name', '') or ''
        picture = google_user.get('picture', '')

        is_new = False
        try:
            user = User.objects.get(email=email)

            # Block non-applicants — staff must use the web portal
            if user.role and user.role.name != 'Applicant':
                return Response(
                    {
                        'error': (
                            f"Your account is registered as '{user.role.name}'. "
                            'Please use the staff web portal to sign in.'
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN
                )

            # Existing user — check account status
            if user.account_status == 'rejected':
                return Response(
                    {'error': 'Your registration was rejected. Please contact the administrator.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            if user.account_status == 'pending':
                return Response(
                    {
                        'error': (
                            'Your account is pending approval. '
                            'Please wait for administrator confirmation.'
                        ),
                        'account_status': 'pending',
                    },
                    status=status.HTTP_403_FORBIDDEN
                )

        except User.DoesNotExist:
            # New user — create applicant account
            # Google buksu.edu.ph login verifies BukSU affiliation.
            # Account still needs admin approval before loan applications.
            try:
                applicant_role = Role.objects.get(name='Applicant')
            except Role.DoesNotExist:
                return Response(
                    {'error': 'System error: Applicant role not found.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Generate a secure random password (user authenticates via Google, not password)
            random_password = ''.join(
                secrets.choice(string.ascii_letters + string.digits)
                for _ in range(48)
            )

            user = User.objects.create_user(
                email=email,
                password=random_password,
                firstname=firstname,
                lastname=lastname,
                role=applicant_role,
                account_status='pending',
                status='active',
            )
            is_new = True

            # Return pending status for new accounts
            return Response(
                {
                    'message': (
                        'Account created successfully! '
                        'Your account is pending admin approval. '
                        'You will be able to log in once approved.'
                    ),
                    'account_status': 'pending',
                    'is_new': True,
                    'user': {
                        'email': user.email,
                        'firstname': user.firstname,
                        'lastname': user.lastname,
                        'picture': picture,
                    }
                },
                status=status.HTTP_201_CREATED
            )

        # Active user — generate JWT tokens and log in
        refresh = RefreshToken.for_user(user)

        return Response(
            {
                'tokens': {
                    'access': str(refresh.access_token),
                    'refresh': str(refresh),
                },
                'user': {
                    'id': user.id,
                    'email': user.email,
                    'firstname': user.firstname,
                    'lastname': user.lastname,
                    'role': user.role.name if user.role else 'Applicant',
                    'account_status': user.account_status,
                    'picture': picture,
                },
                'is_new': is_new,
            },
            status=status.HTTP_200_OK
        )


class StaffGoogleAuthView(APIView):
    """
    POST /api/auth/google/staff/

    Authenticate an existing staff/admin user via Google OAuth.
    The user must already have a registered and approved account.
    No email domain restriction — staff may use any Google account
    that matches their registered email.

    Request body:
        { "access_token": "<google_oauth_access_token>" }

    Response:
        { "tokens": { "access": "...", "refresh": "..." }, "user": {...} }
    """
    permission_classes = []

    def post(self, request):
        access_token = request.data.get('access_token')
        if not access_token:
            return Response(
                {'error': 'access_token is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verify token with Google and get user info
        try:
            google_response = requests.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                headers={'Authorization': f'Bearer {access_token}'},
                timeout=10
            )
            if google_response.status_code != 200:
                return Response(
                    {'error': 'Invalid or expired Google token. Please sign in again.'},
                    status=status.HTTP_401_UNAUTHORIZED
                )
            google_user = google_response.json()
        except requests.RequestException:
            return Response(
                {'error': 'Failed to verify Google token. Check your connection.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        email = google_user.get('email', '')
        email_verified = google_user.get('email_verified', False)
        picture = google_user.get('picture', '')

        if not email_verified:
            return Response(
                {'error': 'Google email is not verified.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Optional: role sent from frontend for cross-role guard
        requested_role = request.data.get('role', '').strip()

        # Find the staff user by email
        try:
            user = User.objects.select_related('role').get(email=email)
        except User.DoesNotExist:
            return Response(
                {
                    'error': (
                        'No staff account found for this Google account. '
                        'Please register first or use a different email.'
                    )
                },
                status=status.HTTP_404_NOT_FOUND
            )

        # Reject applicants — they should use /api/auth/google/ instead
        if user.role and user.role.name == 'Applicant':
            return Response(
                {'error': 'This login is for staff only. Applicants should use the mobile app.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Block cross-role login: user already has a different role
        if requested_role and user.role and user.role.name != requested_role:
            return Response(
                {
                    'error': (
                        f"Your account is registered as '{user.role.name}'. "
                        f"Please select '{user.role.name}' on the role selection screen to sign in."
                    )
                },
                status=status.HTTP_403_FORBIDDEN
            )

        # Check account status
        if user.account_status == 'rejected':
            return Response(
                {'error': 'Your account has been rejected. Please contact the administrator.'},
                status=status.HTTP_403_FORBIDDEN
            )
        if user.account_status == 'pending':
            return Response(
                {
                    'error': (
                        'Your account is pending approval. '
                        'Please wait for the Super Administrator to approve your account.'
                    ),
                    'account_status': 'pending',
                },
                status=status.HTTP_403_FORBIDDEN
            )
        if not user.is_active or user.status == 'suspended':
            return Response(
                {'error': 'Your account has been suspended. Please contact the administrator.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Generate JWT tokens and log in
        refresh = RefreshToken.for_user(user)

        return Response(
            {
                'tokens': {
                    'access': str(refresh.access_token),
                    'refresh': str(refresh),
                },
                'user': {
                    'id': user.id,
                    'email': user.email,
                    'firstname': user.firstname,
                    'lastname': user.lastname,
                    'role': user.role.name if user.role else '',
                    'account_status': user.account_status,
                    'picture': picture,
                },
            },
            status=status.HTTP_200_OK
        )
