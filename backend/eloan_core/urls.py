"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import RedirectView
from django.http import HttpResponse

from authentication.login import StaffLoginView, ApplicantLoginView, SuperAdminLoginView
from authentication.registration import ApplicantRegistrationView, StaffRegistrationView, StaffGoogleRegistrationView
from authentication.google_auth import GoogleAuthView, StaffGoogleAuthView
from authentication.password_reset import (
    SetPasswordView,
    ValidateTokenView,
    ForgotPasswordView
)
from rest_framework_simplejwt.views import TokenRefreshView
from reports.views import reports_dashboard
from authentication.appeal import SubmitAppealView

def favicon_view(request):
    """Avoid 404 for browser favicon requests."""
    return HttpResponse(status=204)

urlpatterns = [
    path('favicon.ico', favicon_view),
    # Root URL redirects to Django admin login
    path('', RedirectView.as_view(url='/admin/login/', permanent=False), name='home'),

    path('admin/', admin.site.urls),
    path('admin/reports/dashboard/', reports_dashboard, name='reports_dashboard'),

    # Staff Portal API Modules
    path('api/bookkeeper/', include('bookkeeper.urls', namespace='bookkeeper')),
    path('api/treasurer/', include('treasurer.urls', namespace='treasurer')),
    path('api/credit-committee/', include('credit_committee.urls', namespace='credit_committee')),
    path('api/amo/', include('account_member_officer.urls', namespace='account_member_officer')),

    # Applicant Mobile App API
    path('api/applicant/', include('applicant.urls', namespace='applicant')),

    # Authentication endpoints
    path('api/auth/login/', StaffLoginView.as_view(), name='staff_login'),
    path('api/auth/superadmin/login/', SuperAdminLoginView.as_view(), name='superadmin_login'),
    path('api/auth/applicant/login/', ApplicantLoginView.as_view(), name='applicant_login'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Password management endpoints
    path('api/auth/forgot-password/', ForgotPasswordView.as_view(), name='forgot_password'),
    path('api/auth/set-password/', SetPasswordView.as_view(), name='set_password'),
    path('api/auth/validate-token/', ValidateTokenView.as_view(), name='validate_token'),

    # Google OAuth for applicants (only buksu.edu.ph emails)
    path('api/auth/google/', GoogleAuthView.as_view(), name='google_auth'),

    # Google OAuth for staff/admins (existing accounts only, no domain restriction)
    path('api/auth/google/staff/', StaffGoogleAuthView.as_view(), name='google_auth_staff'),

    # Applicant self-registration (public endpoint)
    # Creates account with 'pending' status - requires Super Admin approval to login
    path('api/auth/register/', ApplicantRegistrationView.as_view(), name='applicant_register'),

    # Staff self-registration (public endpoint)
    # Creates staff account with 'pending' status - requires Super Admin approval
    path('api/auth/staff/register/', StaffRegistrationView.as_view(), name='staff_register'),

    # Staff registration via Google OAuth (no password needed, employee_id + role still required)
    path('api/auth/staff/register/google/', StaffGoogleRegistrationView.as_view(), name='staff_register_google'),

    # Membership appeal (for rejected applicants)
    path('api/auth/appeal/', SubmitAppealView.as_view(), name='submit_appeal'),

    # Superadmin module
    path('api/superadmin/', include('superadmin.urls', namespace='superadmin')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
