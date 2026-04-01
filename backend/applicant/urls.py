"""
Applicant Module API URL Configuration

API Structure:
    /api/applicant/dashboard/
    /api/applicant/can-apply/
    /api/applicant/loan-types/
    /api/applicant/loan-types/<id>/
    /api/applicant/applications/
    /api/applicant/applications/create/
    /api/applicant/applications/<id>/
    /api/applicant/applications/<id>/step/<step_number>/
    /api/applicant/applications/<id>/submit/
    /api/applicant/applications/<id>/withdraw/
    /api/applicant/applications/<id>/documents/
    /api/applicant/applications/<id>/documents/upload/
    /api/applicant/applications/<id>/face-capture/
    /api/applicant/applications/<id>/liveness-check/
    /api/applicant/applications/<id>/verification-status/
    /api/applicant/applications/<id>/comakers/
    /api/applicant/documents/<id>/
    /api/applicant/documents/<id>/replace/
    /api/applicant/comakers/<id>/
    /api/applicant/search-users/
    /api/applicant/calculate-amortization/
    /api/applicant/profile/
    /api/applicant/profile/picture/
    /api/applicant/profile/change-password/
    /api/applicant/autofill-data/
    /api/applicant/notifications/
    /api/applicant/notifications/<id>/read/
    /api/applicant/notifications/mark-all-read/
    /api/applicant/notifications/unread-count/
"""

from django.urls import path
from . import views

app_name = 'applicant'

urlpatterns = [
    # Dashboard
    path('dashboard/', views.DashboardView.as_view(), name='dashboard'),
    path('can-apply/', views.CanApplyView.as_view(), name='can_apply'),

    # Loan Types
    path('loan-types/', views.LoanTypeListView.as_view(), name='loan_types'),
    path('loan-types/<int:pk>/', views.LoanTypeDetailView.as_view(), name='loan_type_detail'),
    path('loan-types/<int:pk>/required-documents/', views.LoanTypeRequiredDocumentsView.as_view(), name='loan_type_required_documents'),

    # Applications
    path('applications/', views.ApplicationListView.as_view(), name='applications'),
    path('applications/create/', views.CreateApplicationView.as_view(), name='create_application'),
    path('applications/<int:pk>/', views.ApplicationDetailView.as_view(), name='application_detail'),
    path('applications/<int:pk>/step/<int:step_number>/', views.UpdateApplicationStepView.as_view(), name='update_step'),
    path('applications/<int:pk>/submit/', views.SubmitApplicationView.as_view(), name='submit_application'),
    path('applications/<int:pk>/withdraw/', views.WithdrawApplicationView.as_view(), name='withdraw_application'),
    path('applications/<int:pk>/delete/', views.DeleteDraftApplicationView.as_view(), name='delete_draft_application'),
    path('applications/<int:pk>/download-pdf/', views.DownloadApplicationPDFView.as_view(), name='download_application_pdf'),
    path('applications/<int:pk>/schedule/', views.LoanScheduleView.as_view(), name='loan_schedule'),

    # Documents
    path('applications/<int:app_id>/documents/', views.DocumentListView.as_view(), name='documents'),
    path('applications/<int:app_id>/documents/upload/', views.DocumentUploadView.as_view(), name='upload_document'),
    path('applications/<int:app_id>/id-ocr-scan/', views.IDOCRScanView.as_view(), name='id_ocr_scan'),
    path('documents/<int:pk>/', views.DocumentDetailView.as_view(), name='document_detail'),
    path('documents/<int:pk>/replace/', views.DocumentReplaceView.as_view(), name='replace_document'),

    # Verification
    path('applications/<int:app_id>/face-capture/', views.FaceCaptureView.as_view(), name='face_capture'),
    path('applications/<int:app_id>/face-verification/retry/', views.RetryFaceVerificationView.as_view(), name='retry_face_verification'),
    path('applications/<int:app_id>/liveness-check/', views.LivenessCheckView.as_view(), name='liveness_check'),
    path('applications/<int:app_id>/liveness-video/', views.LivenessVideoView.as_view(), name='liveness_video'),
    path('applications/<int:app_id>/combined-verification/', views.CombinedVerificationView.as_view(), name='combined_verification'),
    path('applications/<int:app_id>/verification-status/', views.VerificationStatusView.as_view(), name='verification_status'),
    # Co-Makers
    path('search-users/', views.SearchUsersView.as_view(), name='search_users'),
    path('applications/<int:app_id>/comakers/', views.CoMakerListView.as_view(), name='comakers'),
    path('comakers/<int:pk>/', views.CoMakerDetailView.as_view(), name='comaker_detail'),

    # Calculations
    path('calculate-amortization/', views.CalculateAmortizationView.as_view(), name='calculate_amortization'),

    # Profile
    path('profile/', views.ProfileView.as_view(), name='profile'),
    path('profile/picture/', views.ProfilePictureView.as_view(), name='profile_picture'),
    path('profile/change-password/', views.ChangePasswordView.as_view(), name='change_password'),
    path('autofill-data/', views.AutofillDataView.as_view(), name='autofill_data'),

    # Notifications
    path('notifications/', views.NotificationListView.as_view(), name='notifications'),
    path('notifications/<int:pk>/read/', views.MarkNotificationReadView.as_view(), name='mark_read'),
    path('notifications/<int:pk>/delete/', views.DeleteNotificationView.as_view(), name='delete_notification'),
    path('notifications/<int:pk>/archive/', views.ArchiveNotificationView.as_view(), name='archive_notification'),
    path('notifications/mark-all-read/', views.MarkAllNotificationsReadView.as_view(), name='mark_all_read'),
    path('notifications/unread-count/', views.UnreadCountView.as_view(), name='unread_count'),
]
