"""
Bookkeeper Module API URL Configuration

REST API endpoints for React frontend.
All endpoints require JWT authentication.

API Structure:
    /api/bookkeeper/dashboard/
    /api/bookkeeper/applications/
    /api/bookkeeper/applications/<id>/
    /api/bookkeeper/applications/<id>/verify/
    /api/bookkeeper/applications/<id>/reject/
    /api/bookkeeper/reports/
    /api/bookkeeper/notifications/
    /api/bookkeeper/notifications/<id>/read/
    /api/bookkeeper/notifications/mark-all-read/
    /api/bookkeeper/notifications/unread-count/
    /api/bookkeeper/settings/profile/
    /api/bookkeeper/settings/profile/picture/
    /api/bookkeeper/settings/change-password/
    /api/bookkeeper/settings/notification-preferences/
    /api/bookkeeper/settings/deactivate-account/
    /api/bookkeeper/settings/logout-everywhere/
"""

from django.urls import path
from . import views

app_name = 'bookkeeper'

urlpatterns = [
    # ==========================================================================
    # Dashboard
    # ==========================================================================
    path('dashboard/', views.DashboardView.as_view(), name='dashboard'),

    # ==========================================================================
    # Applications
    # ==========================================================================
    path('applications/', views.ApplicationListView.as_view(), name='applications'),
    path('applications/<int:pk>/', views.ApplicationDetailView.as_view(), name='application_detail'),
    path('applications/<int:pk>/verify/', views.VerifyApplicationView.as_view(), name='verify_application'),
    path('applications/<int:pk>/reject/', views.RejectApplicationView.as_view(), name='reject_application'),
    path('applications/<int:pk>/download-pdf/', views.DownloadApplicationPDFView.as_view(), name='download_application_pdf'),

    # ==========================================================================
    # Payments / Accounting
    # ==========================================================================
    path('payments/unconfirmed/', views.UnconfirmedPaymentsView.as_view(), name='unconfirmed_payments'),
    path('payments/<int:pk>/confirm/', views.ConfirmPaymentView.as_view(), name='confirm_payment'),

    # ==========================================================================
    # Active Loans & Disbursement Recording
    # ==========================================================================
    path('loans/active/', views.BookkeeperActiveLoansView.as_view(), name='active_loans'),
    path('loans/<int:pk>/record-disbursement/', views.RecordDisbursementView.as_view(), name='record_disbursement'),

    # ==========================================================================
    # Reports
    # ==========================================================================
    path('reports/', views.ReportsView.as_view(), name='reports'),

    # ==========================================================================
    # Notifications
    # ==========================================================================
    path('notifications/', views.NotificationListView.as_view(), name='notifications'),
    path('notifications/<int:pk>/read/', views.MarkNotificationReadView.as_view(), name='mark_notification_read'),
    path('notifications/<int:pk>/delete/', views.DeleteNotificationView.as_view(), name='delete_notification'),
    path('notifications/<int:pk>/archive/', views.ArchiveNotificationView.as_view(), name='archive_notification'),
    path('notifications/mark-all-read/', views.MarkAllNotificationsReadView.as_view(), name='mark_all_notifications_read'),
    path('notifications/unread-count/', views.UnreadNotificationCountView.as_view(), name='unread_notification_count'),

    # ==========================================================================
    # Settings
    # ==========================================================================
    path('settings/profile/', views.ProfileView.as_view(), name='profile'),
    path('settings/profile/picture/', views.ProfilePictureView.as_view(), name='profile_picture'),
    path('settings/change-password/', views.ChangePasswordView.as_view(), name='change_password'),
    path('settings/notification-preferences/', views.NotificationPreferencesView.as_view(), name='notification_preferences'),
    path('settings/deactivate-account/', views.DeactivateAccountView.as_view(), name='deactivate_account'),
    path('settings/logout-everywhere/', views.LogoutEverywhereView.as_view(), name='logout_everywhere'),
]
