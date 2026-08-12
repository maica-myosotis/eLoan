"""
Test Suite: Face Verification & Liveness Check
===============================================

Covers:
  Part A — FaceComparisonService (backend/applicant/face_verification_service.py)
    A1. detect_face()                — image loading, Haar Cascade, multi-face
    A2. compare_faces()             — DeepFace, missing files, ValueError
    A3. Similarity calculation      — piecewise linear cosine→% mapping
    A4. verify_faces_for_application() — full pipeline, status transitions,
                                        audit logs, retry/idempotency, cleanup

  Part B — MediaPipeLivenessService (backend/applicant/liveness_service.py)
    B1. _ear()                      — Eye Aspect Ratio formula
    B2. _head_pose()                — rotation matrix → yaw/pitch/roll
    B3. verify_liveness()           — per-method checks, confidence, thresholds
    B4. LivenessVerificationService — DB persistence, audit logs, status

  Part C — API endpoints (backend/applicant/views.py)
    C1. FaceCaptureView             — auth, file presence, 201/400/422
    C2. LivenessCheckView           — method validation, 201/422
    C3. LivenessVideoView           — extension validation, frame aggregation
    C4. VerificationStatusView      — GET status reflection

Run with:
    cd backend && python manage.py test applicant.tests --verbosity=2
"""

import io
import json
import os
import tempfile
from decimal import Decimal
from unittest.mock import MagicMock, patch, call

import numpy as np
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _make_dummy_jpeg(width=200, height=200):
    """Return raw bytes of a solid-grey JPEG."""
    import cv2
    img = np.full((height, width, 3), 128, dtype=np.uint8)
    ok, buf = cv2.imencode('.jpg', img)
    assert ok, "cv2.imencode failed in test helper"
    return buf.tobytes()


def _write_tmp_image(width=200, height=200, suffix='.jpg'):
    """Write a solid-grey JPEG to a temp file and return the path. Caller deletes."""
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    tmp.write(_make_dummy_jpeg(width, height))
    tmp.flush()
    tmp.close()
    return tmp.name


def _make_applicant_user(email='applicant@test.com', password='TestPass123!'):
    """
    Create an Applicant-role user.

    The custom User model uses email as USERNAME_FIELD and requires
    firstname + lastname — so we must pass those explicitly.
    """
    from users.models import Role
    role, _ = Role.objects.get_or_create(name='Applicant')
    user = User.objects.create_user(
        email=email,
        password=password,
        firstname='Test',
        lastname='User',
    )
    user.role = role
    user.save()
    return user


def _make_loan_application(user):
    """Create a minimal LoanApplication for the given user."""
    from loans.models import LoanApplication, LoanType
    # LoanType uses 'loan_name', not 'name'
    loan_type, _ = LoanType.objects.get_or_create(
        loan_name='Test Loan',
        defaults={
            'interest_rate': Decimal('5.00'),
            'max_amount': Decimal('50000'),
            'min_amount': Decimal('1000'),
            'max_term_months': 36,
        }
    )
    # LoanApplication uses 'amount_requested', has no plain 'status' field
    application = LoanApplication.objects.create(
        user=user,
        loan_type=loan_type,
        amount_requested=Decimal('10000'),
        term_months=12,
    )
    return application


def _jwt_for(user):
    """Return a dict suitable for passing as **kwargs to APITestCase.client methods."""
    refresh = RefreshToken.for_user(user)
    return {'HTTP_AUTHORIZATION': f'Bearer {str(refresh.access_token)}'}


# ===========================================================================
# PART A — FaceComparisonService
# ===========================================================================

class TestApplicantStatusHandling(TestCase):
    """Regression coverage for applicant status buckets used by eligibility/dashboard."""

    def test_approved_for_disbursement_blocks_new_application(self):
        from applicant.models import Member, Savings
        from applicant.services import LoanApplicationService
        from applicant.utils import ApplicationStatuses
        from loans.models import ApplicationStatus

        user = _make_applicant_user('status_block@test.com')
        member = Member.objects.create(user=user)
        Savings.objects.create(member=member, amount=Decimal('200.00'))

        application = _make_loan_application(user)
        application.current_status, _ = ApplicationStatus.objects.get_or_create(
            status_name=ApplicationStatuses.APPROVED_FOR_DISBURSEMENT
        )
        application.save(update_fields=['current_status'])

        result = LoanApplicationService.check_can_apply(user)

        self.assertFalse(result['can_apply'])
        self.assertIn('active loan', result['reason'].lower())

    def test_dashboard_counts_current_active_loan_statuses(self):
        from applicant.services import ApplicantDashboardService
        from applicant.utils import ApplicationStatuses
        from loans.models import ApplicationStatus

        user = _make_applicant_user('status_dashboard@test.com')
        for status_name in [
            ApplicationStatuses.APPROVED_FOR_DISBURSEMENT,
            ApplicationStatuses.ACTIVE,
            ApplicationStatuses.OVERDUE,
        ]:
            application = _make_loan_application(user)
            application.current_status, _ = ApplicationStatus.objects.get_or_create(
                status_name=status_name
            )
            application.save(update_fields=['current_status'])

        completed = _make_loan_application(user)
        completed.current_status, _ = ApplicationStatus.objects.get_or_create(
            status_name=ApplicationStatuses.COMPLETED
        )
        completed.save(update_fields=['current_status'])

        stats = ApplicantDashboardService.get_dashboard_stats(user)

        self.assertEqual(stats['approved_loans'], 3)
        self.assertTrue(stats['has_active_loan'])


class TestDetectFace(TestCase):
    """
    TC-FV-001 through TC-FV-006
    Unit tests for FaceComparisonService.detect_face()
    """

    def setUp(self):
        from applicant.face_verification_service import FaceComparisonService
        self.service = FaceComparisonService

    # ------------------------------------------------------------------
    # TC-FV-001: File does not exist
    # ------------------------------------------------------------------
    def test_missing_file_returns_failure(self):
        """TC-FV-001: detect_face() returns success=False when the path does not exist."""
        result = self.service.detect_face('/nonexistent/path/image.jpg')
        self.assertFalse(result['success'])
        self.assertEqual(result['face_count'], 0)
        self.assertIsNone(result['face_region'])
        self.assertIn('not found', result['message'].lower())

    # ------------------------------------------------------------------
    # TC-FV-002: Zero-byte file
    # ------------------------------------------------------------------
    def test_empty_file_returns_failure(self):
        """TC-FV-002: detect_face() returns success=False for a 0-byte file."""
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
            path = f.name          # nothing written — 0 bytes
        try:
            result = self.service.detect_face(path)
            self.assertFalse(result['success'])
            self.assertIn('empty', result['message'].lower())
        finally:
            os.unlink(path)

    # ------------------------------------------------------------------
    # TC-FV-003: Valid image — single face detected
    # ------------------------------------------------------------------
    @patch('applicant.face_verification_service.cv2.CascadeClassifier')
    @patch('applicant.face_verification_service.FaceComparisonService._load_image')
    def test_single_face_detected(self, mock_load, mock_cascade_cls):
        """TC-FV-003: One face → success=True, face_count=1, correct face_region."""
        img = np.zeros((300, 300, 3), dtype=np.uint8)
        mock_load.return_value = (img, None)

        mock_cascade = MagicMock()
        mock_cascade.detectMultiScale.return_value = np.array([[50, 60, 80, 90]])
        mock_cascade_cls.return_value = mock_cascade

        path = _write_tmp_image()
        try:
            result = self.service.detect_face(path)
            self.assertTrue(result['success'])
            self.assertEqual(result['face_count'], 1)
            self.assertEqual(result['face_region'], (50, 60, 80, 90))
            self.assertIn('detected', result['message'].lower())
        finally:
            os.unlink(path)

    # ------------------------------------------------------------------
    # TC-FV-004: Valid image — no faces detected
    # ------------------------------------------------------------------
    @patch('applicant.face_verification_service.cv2.CascadeClassifier')
    @patch('applicant.face_verification_service.FaceComparisonService._load_image')
    def test_no_face_detected(self, mock_load, mock_cascade_cls):
        """TC-FV-004: No face → success=False, face_count=0, 'No face detected' message."""
        img = np.zeros((300, 300, 3), dtype=np.uint8)
        mock_load.return_value = (img, None)

        mock_cascade = MagicMock()
        mock_cascade.detectMultiScale.return_value = np.array([])
        mock_cascade_cls.return_value = mock_cascade

        path = _write_tmp_image()
        try:
            result = self.service.detect_face(path)
            self.assertFalse(result['success'])
            self.assertEqual(result['face_count'], 0)
            self.assertIsNone(result['face_region'])
            self.assertIn('no face', result['message'].lower())
        finally:
            os.unlink(path)

    # ------------------------------------------------------------------
    # TC-FV-005: Multiple faces — service picks the largest
    # ------------------------------------------------------------------
    @patch('applicant.face_verification_service.cv2.CascadeClassifier')
    @patch('applicant.face_verification_service.FaceComparisonService._load_image')
    def test_multiple_faces_picks_largest(self, mock_load, mock_cascade_cls):
        """TC-FV-005: Two faces → success=True, largest face (100×100) returned."""
        img = np.zeros((600, 600, 3), dtype=np.uint8)
        mock_load.return_value = (img, None)

        # Face A: 40×40 = 1 600 px²;  Face B: 100×100 = 10 000 px²  (largest)
        faces = np.array([[10, 10, 40, 40], [200, 200, 100, 100]])
        mock_cascade = MagicMock()
        mock_cascade.detectMultiScale.return_value = faces
        mock_cascade_cls.return_value = mock_cascade

        path = _write_tmp_image()
        try:
            result = self.service.detect_face(path)
            self.assertTrue(result['success'])
            self.assertEqual(result['face_count'], 2)
            self.assertEqual(result['face_region'], (200, 200, 100, 100))
        finally:
            os.unlink(path)

    # ------------------------------------------------------------------
    # TC-FV-006: Both cv2 and Pillow fail to load the image
    # ------------------------------------------------------------------
    @patch('applicant.face_verification_service.FaceComparisonService._load_image')
    def test_image_load_failure(self, mock_load):
        """TC-FV-006: _load_image returns None → success=False with load error message."""
        mock_load.return_value = (None, 'Could not load image. OpenCV and Pillow both failed.')

        path = _write_tmp_image()
        try:
            result = self.service.detect_face(path)
            self.assertFalse(result['success'])
            self.assertIn('Could not load', result['message'])
        finally:
            os.unlink(path)


# ---------------------------------------------------------------------------

class TestCompareFaces(TestCase):
    """
    TC-FV-011 through TC-FV-016
    Unit tests for FaceComparisonService.compare_faces()
    """

    def setUp(self):
        from applicant.face_verification_service import FaceComparisonService
        self.service = FaceComparisonService

    # ------------------------------------------------------------------
    # TC-FV-011: ID photo file is missing
    # ------------------------------------------------------------------
    def test_missing_id_photo(self):
        """TC-FV-011: compare_faces() returns success=False when ID photo path does not exist."""
        selfie_path = _write_tmp_image()
        try:
            result = self.service.compare_faces('/not/here/id.jpg', selfie_path)
            self.assertFalse(result['success'])
            self.assertFalse(result['verified'])
            self.assertIn('ID photo not found', result['message'])
        finally:
            os.unlink(selfie_path)

    # ------------------------------------------------------------------
    # TC-FV-012: Selfie file is missing
    # ------------------------------------------------------------------
    def test_missing_selfie(self):
        """TC-FV-012: compare_faces() returns success=False when selfie path does not exist."""
        id_path = _write_tmp_image()
        try:
            result = self.service.compare_faces(id_path, '/not/here/selfie.jpg')
            self.assertFalse(result['success'])
            self.assertIn('Selfie not found', result['message'])
        finally:
            os.unlink(id_path)

    # ------------------------------------------------------------------
    # TC-FV-013: DeepFace.verify raises ValueError (no face detected in image)
    # ------------------------------------------------------------------
    @patch('applicant.face_verification_service.DeepFace.verify')
    def test_deepface_value_error_propagated(self, mock_verify):
        """TC-FV-013: DeepFace ValueError → success=False, 'Face detection failed' message."""
        mock_verify.side_effect = ValueError('Face could not be detected.')
        id_path = _write_tmp_image()
        selfie_path = _write_tmp_image()
        try:
            result = self.service.compare_faces(id_path, selfie_path)
            self.assertFalse(result['success'])
            self.assertFalse(result['verified'])
            self.assertIn('Face detection failed', result['message'])
        finally:
            os.unlink(id_path)
            os.unlink(selfie_path)

    # ------------------------------------------------------------------
    # TC-FV-014: Faces match — low distance
    # ------------------------------------------------------------------
    @patch('applicant.face_verification_service.DeepFace.verify')
    def test_faces_match_verified(self, mock_verify):
        """TC-FV-014: Distance 0.35 → verified=True, similarity > 85%."""
        mock_verify.return_value = {'verified': True, 'distance': 0.35, 'threshold': 0.68}
        id_path = _write_tmp_image()
        selfie_path = _write_tmp_image()
        try:
            result = self.service.compare_faces(id_path, selfie_path)
            self.assertTrue(result['success'])
            self.assertTrue(result['verified'])
            self.assertAlmostEqual(result['distance'], 0.35)
            self.assertGreater(result['similarity_percentage'], 85.0)
        finally:
            os.unlink(id_path)
            os.unlink(selfie_path)

    # ------------------------------------------------------------------
    # TC-FV-015: Faces do not match — high distance
    # ------------------------------------------------------------------
    @patch('applicant.face_verification_service.DeepFace.verify')
    def test_faces_no_match(self, mock_verify):
        """TC-FV-015: Distance 0.90 → verified=False, similarity < 60%."""
        mock_verify.return_value = {'verified': False, 'distance': 0.90, 'threshold': 0.68}
        id_path = _write_tmp_image()
        selfie_path = _write_tmp_image()
        try:
            result = self.service.compare_faces(id_path, selfie_path)
            self.assertTrue(result['success'])
            self.assertFalse(result['verified'])
            self.assertLess(result['similarity_percentage'], 60.0)
        finally:
            os.unlink(id_path)
            os.unlink(selfie_path)

    # ------------------------------------------------------------------
    # TC-FV-016: Unexpected exception from DeepFace
    # ------------------------------------------------------------------
    @patch('applicant.face_verification_service.DeepFace.verify')
    def test_unexpected_exception(self, mock_verify):
        """TC-FV-016: Unexpected error → success=False, error message included."""
        mock_verify.side_effect = RuntimeError('GPU out of memory')
        id_path = _write_tmp_image()
        selfie_path = _write_tmp_image()
        try:
            result = self.service.compare_faces(id_path, selfie_path)
            self.assertFalse(result['success'])
            self.assertIn('Error', result['message'])
        finally:
            os.unlink(id_path)
            os.unlink(selfie_path)


# ---------------------------------------------------------------------------

class TestSimilarityPercentageCalculation(TestCase):
    """
    TC-FV-020 through TC-FV-026
    Verify the piecewise linear cosine→similarity mapping.

    Zones (ArcFace / cosine):
      distance ≤ 0.60  →  100 − (d / 0.60) × 15        (85–100 %)
      0.60 < d ≤ 0.75  →  85 − ((d − 0.60) / 0.15) × 25 (60–85 %)
      d > 0.75          →  max(0, 60 − ((d − 0.75) / 0.25) × 60) (0–60 %)
    """

    def _compare(self, distance):
        """Run compare_faces with a mocked DeepFace returning the given distance."""
        from applicant.face_verification_service import FaceComparisonService
        with patch('applicant.face_verification_service.DeepFace.verify') as mock_verify:
            mock_verify.return_value = {
                'verified': distance <= 0.68,
                'distance': distance,
                'threshold': 0.68,
            }
            id_path = _write_tmp_image()
            selfie_path = _write_tmp_image()
            try:
                result = FaceComparisonService.compare_faces(id_path, selfie_path)
            finally:
                os.unlink(id_path)
                os.unlink(selfie_path)
        return result['similarity_percentage']

    def test_distance_0_gives_100_percent(self):
        """TC-FV-020: distance=0.00 → similarity=100%."""
        self.assertAlmostEqual(self._compare(0.00), 100.0, places=1)

    def test_distance_0_30_in_top_zone(self):
        """TC-FV-021: distance=0.30 → similarity ≈ 92.5% (zone 1)."""
        expected = 100 - (0.30 / 0.60) * 15   # 92.5
        self.assertAlmostEqual(self._compare(0.30), expected, places=1)

    def test_distance_0_60_at_zone_boundary(self):
        """TC-FV-022: distance=0.60 → similarity=85% (boundary between zone 1 and 2)."""
        self.assertAlmostEqual(self._compare(0.60), 85.0, places=1)

    def test_distance_0_675_in_review_zone(self):
        """TC-FV-023: distance=0.675 → similarity ≈ 72.5% (zone 2)."""
        expected = 85 - ((0.675 - 0.60) / 0.15) * 25   # 72.5
        self.assertAlmostEqual(self._compare(0.675), expected, places=1)

    def test_distance_0_75_at_upper_boundary(self):
        """TC-FV-024: distance=0.75 → similarity=60% (boundary before reject zone)."""
        self.assertAlmostEqual(self._compare(0.75), 60.0, places=1)

    def test_distance_0_875_in_reject_zone(self):
        """TC-FV-025: distance=0.875 → similarity=30% (zone 3)."""
        expected = max(0.0, 60 - ((0.875 - 0.75) / 0.25) * 60)   # 30.0
        self.assertAlmostEqual(self._compare(0.875), expected, places=1)

    def test_distance_above_1_clamps_to_0(self):
        """TC-FV-026: distance=1.10 → similarity≥0 (clamped at floor)."""
        sim = self._compare(1.10)
        self.assertGreaterEqual(sim, 0.0)
        self.assertLess(sim, 10.0)


# ---------------------------------------------------------------------------

class TestVerifyFacesForApplication(TestCase):
    """
    TC-FV-027 through TC-FV-035
    Integration tests for FaceComparisonService.verify_faces_for_application()
    """

    def setUp(self):
        self.user = _make_applicant_user('fv_pipeline@test.com')
        self.application = _make_loan_application(self.user)

    # ------------------------------------------------------------------
    # TC-FV-027: Application does not exist
    # ------------------------------------------------------------------
    def test_nonexistent_application_raises(self):
        """TC-FV-027: Non-existent app_id raises LoanApplication.DoesNotExist."""
        from applicant.face_verification_service import FaceComparisonService
        from loans.models import LoanApplication
        with self.assertRaises(LoanApplication.DoesNotExist):
            FaceComparisonService.verify_faces_for_application(999999)

    # ------------------------------------------------------------------
    # TC-FV-028: No BukSu ID uploaded
    # ------------------------------------------------------------------
    def test_missing_buksu_id_fails(self):
        """TC-FV-028: No buksu_id document → status=Failed, error mentions BukSu ID."""
        from applicant.face_verification_service import FaceComparisonService

        result = FaceComparisonService.verify_faces_for_application(
            self.application.id,
            captured_image_path='applicant/selfies/test.jpg'
        )
        self.assertEqual(result.verification_status, 'Failed')
        self.assertIn('BukSu ID not found', result.error_message)

    # ------------------------------------------------------------------
    # TC-FV-029: No selfie provided
    # ------------------------------------------------------------------
    def test_missing_selfie_fails(self):
        """TC-FV-029: captured_image_path=None → status=Failed, error mentions selfie."""
        from applicant.face_verification_service import FaceComparisonService
        from loans.models import LoanDocument

        LoanDocument.objects.create(
            loan_application=self.application,
            document_type='buksu_id',
            file_path='applicant/docs/dummy_id.jpg',
        )

        result = FaceComparisonService.verify_faces_for_application(
            self.application.id,
            captured_image_path=None
        )
        self.assertEqual(result.verification_status, 'Failed')
        self.assertIn('Selfie not found', result.error_message)

    # ------------------------------------------------------------------
    # TC-FV-030: Old FaceVerification records are purged on retry
    # ------------------------------------------------------------------
    def test_existing_verification_purged_on_retry(self):
        """TC-FV-030: Calling verify_faces_for_application twice leaves exactly 1 record."""
        from applicant.face_verification_service import FaceComparisonService
        from loans.models import FaceVerification

        # First call — fails (no ID doc), creates 1 record
        FaceComparisonService.verify_faces_for_application(
            self.application.id, captured_image_path='selfie/path.jpg'
        )
        self.assertEqual(
            FaceVerification.objects.filter(loan_application=self.application).count(), 1
        )

        # Second call — must delete the old record and create exactly 1 new one
        FaceComparisonService.verify_faces_for_application(
            self.application.id, captured_image_path='selfie/path2.jpg'
        )
        self.assertEqual(
            FaceVerification.objects.filter(loan_application=self.application).count(), 1
        )

    # ------------------------------------------------------------------
    # TC-FV-031: Full happy path — auto-approved (distance ≤ 0.60)
    # ------------------------------------------------------------------
    @patch('applicant.face_verification_service.FaceComparisonService.compare_faces')
    @patch('applicant.face_verification_service.FaceComparisonService.detect_face')
    @patch('applicant.face_verification_service.FaceComparisonService.extract_face_from_document')
    @patch('applicant.face_verification_service.FaceComparisonService._decrypt_to_temp')
    @override_settings(
        MEDIA_ROOT=tempfile.gettempdir(),
        FACE_VERIFICATION={'AUTO_APPROVE_MAX_DISTANCE': 0.60, 'REVIEW_MAX_DISTANCE': 0.75}
    )
    def test_auto_approved_when_distance_low(
        self, mock_decrypt, mock_extract, mock_detect, mock_compare
    ):
        """TC-FV-031: distance=0.30 → status=Verified, is_match=True."""
        from applicant.face_verification_service import FaceComparisonService
        from loans.models import LoanDocument

        id_tmp = _write_tmp_image()
        selfie_tmp = _write_tmp_image()
        selfie_rel = os.path.relpath(selfie_tmp, tempfile.gettempdir())

        LoanDocument.objects.create(
            loan_application=self.application,
            document_type='buksu_id',
            file_path=os.path.relpath(id_tmp, tempfile.gettempdir()),
        )

        mock_decrypt.return_value = (id_tmp, None)
        mock_extract.return_value = {
            'success': True,
            'face_path': id_tmp,
            'coordinates': {'x': 10, 'y': 10, 'width': 80, 'height': 80},
            'message': 'Face extracted successfully',
        }
        mock_detect.return_value = {
            'success': True, 'face_count': 1,
            'face_region': (10, 10, 80, 80), 'message': 'ok'
        }
        mock_compare.return_value = {
            'success': True, 'verified': True, 'distance': 0.30,
            'threshold': 0.68, 'similarity_percentage': 92.5,
            'model': 'ArcFace', 'distance_metric': 'cosine',
            'message': 'Face comparison completed successfully',
        }

        try:
            result = FaceComparisonService.verify_faces_for_application(
                self.application.id, captured_image_path=selfie_rel
            )
            self.assertEqual(result.verification_status, 'Verified')
            self.assertTrue(result.is_match)
            self.assertTrue(result.face_detected_in_id)
            self.assertTrue(result.face_detected_in_selfie)
        finally:
            for p in (id_tmp, selfie_tmp):
                if os.path.exists(p):
                    os.unlink(p)

    # ------------------------------------------------------------------
    # TC-FV-032: Borderline match — needs review (0.60 < distance ≤ 0.75)
    # ------------------------------------------------------------------
    @patch('applicant.face_verification_service.FaceComparisonService.compare_faces')
    @patch('applicant.face_verification_service.FaceComparisonService.detect_face')
    @patch('applicant.face_verification_service.FaceComparisonService.extract_face_from_document')
    @patch('applicant.face_verification_service.FaceComparisonService._decrypt_to_temp')
    @override_settings(
        MEDIA_ROOT=tempfile.gettempdir(),
        FACE_VERIFICATION={'AUTO_APPROVE_MAX_DISTANCE': 0.60, 'REVIEW_MAX_DISTANCE': 0.75}
    )
    def test_needs_review_when_distance_borderline(
        self, mock_decrypt, mock_extract, mock_detect, mock_compare
    ):
        """TC-FV-032: distance=0.68 → status='Needs Review', is_match=True."""
        from applicant.face_verification_service import FaceComparisonService
        from loans.models import LoanDocument

        id_tmp = _write_tmp_image()
        selfie_tmp = _write_tmp_image()
        selfie_rel = os.path.relpath(selfie_tmp, tempfile.gettempdir())

        LoanDocument.objects.create(
            loan_application=self.application,
            document_type='buksu_id',
            file_path=os.path.relpath(id_tmp, tempfile.gettempdir()),
        )
        mock_decrypt.return_value = (id_tmp, None)
        mock_extract.return_value = {
            'success': True, 'face_path': id_tmp,
            'coordinates': {'x': 0, 'y': 0, 'width': 100, 'height': 100},
            'message': 'ok'
        }
        mock_detect.return_value = {
            'success': True, 'face_count': 1,
            'face_region': (0, 0, 100, 100), 'message': 'ok'
        }
        mock_compare.return_value = {
            'success': True, 'verified': True, 'distance': 0.68,
            'threshold': 0.68, 'similarity_percentage': 73.0,
            'model': 'ArcFace', 'distance_metric': 'cosine',
            'message': 'Face comparison completed successfully',
        }

        try:
            result = FaceComparisonService.verify_faces_for_application(
                self.application.id, captured_image_path=selfie_rel
            )
            self.assertEqual(result.verification_status, 'Needs Review')
            self.assertTrue(result.is_match)
        finally:
            for p in (id_tmp, selfie_tmp):
                if os.path.exists(p):
                    os.unlink(p)

    # ------------------------------------------------------------------
    # TC-FV-033: Face mismatch — rejected (distance > 0.75)
    # ------------------------------------------------------------------
    @patch('applicant.face_verification_service.FaceComparisonService.compare_faces')
    @patch('applicant.face_verification_service.FaceComparisonService.detect_face')
    @patch('applicant.face_verification_service.FaceComparisonService.extract_face_from_document')
    @patch('applicant.face_verification_service.FaceComparisonService._decrypt_to_temp')
    @override_settings(
        MEDIA_ROOT=tempfile.gettempdir(),
        FACE_VERIFICATION={'AUTO_APPROVE_MAX_DISTANCE': 0.60, 'REVIEW_MAX_DISTANCE': 0.75}
    )
    def test_rejected_when_distance_too_high(
        self, mock_decrypt, mock_extract, mock_detect, mock_compare
    ):
        """TC-FV-033: distance=0.90 → status=Failed, is_match=False."""
        from applicant.face_verification_service import FaceComparisonService
        from loans.models import LoanDocument

        id_tmp = _write_tmp_image()
        selfie_tmp = _write_tmp_image()
        selfie_rel = os.path.relpath(selfie_tmp, tempfile.gettempdir())

        LoanDocument.objects.create(
            loan_application=self.application,
            document_type='buksu_id',
            file_path=os.path.relpath(id_tmp, tempfile.gettempdir()),
        )
        mock_decrypt.return_value = (id_tmp, None)
        mock_extract.return_value = {
            'success': True, 'face_path': id_tmp,
            'coordinates': {'x': 0, 'y': 0, 'width': 100, 'height': 100},
            'message': 'ok'
        }
        mock_detect.return_value = {
            'success': True, 'face_count': 1,
            'face_region': (0, 0, 100, 100), 'message': 'ok'
        }
        mock_compare.return_value = {
            'success': True, 'verified': False, 'distance': 0.90,
            'threshold': 0.68, 'similarity_percentage': 12.0,
            'model': 'ArcFace', 'distance_metric': 'cosine',
            'message': 'Face comparison completed successfully',
        }

        try:
            result = FaceComparisonService.verify_faces_for_application(
                self.application.id, captured_image_path=selfie_rel
            )
            self.assertEqual(result.verification_status, 'Failed')
            self.assertFalse(result.is_match)
            self.assertIn('0.9000', result.error_message)
        finally:
            for p in (id_tmp, selfie_tmp):
                if os.path.exists(p):
                    os.unlink(p)

    # ------------------------------------------------------------------
    # TC-FV-034: Temp decrypted file is cleaned up even on failure
    # ------------------------------------------------------------------
    @patch('applicant.face_verification_service.FaceComparisonService.extract_face_from_document')
    @patch('applicant.face_verification_service.FaceComparisonService._decrypt_to_temp')
    @override_settings(MEDIA_ROOT=tempfile.gettempdir())
    def test_temp_file_cleaned_up_on_extract_failure(self, mock_decrypt, mock_extract):
        """TC-FV-034: Decrypted temp file is deleted even when face extraction fails."""
        from applicant.face_verification_service import FaceComparisonService
        from loans.models import LoanDocument

        id_tmp = _write_tmp_image()
        selfie_tmp = _write_tmp_image()
        decrypted_tmp = _write_tmp_image()
        selfie_rel = os.path.relpath(selfie_tmp, tempfile.gettempdir())

        mock_decrypt.return_value = (decrypted_tmp, None)
        mock_extract.return_value = {
            'success': False, 'face_path': None,
            'coordinates': None, 'message': 'No face in ID'
        }

        LoanDocument.objects.create(
            loan_application=self.application,
            document_type='buksu_id',
            file_path=os.path.relpath(id_tmp, tempfile.gettempdir()),
        )

        try:
            FaceComparisonService.verify_faces_for_application(
                self.application.id, captured_image_path=selfie_rel
            )
        finally:
            self.assertFalse(
                os.path.exists(decrypted_tmp),
                "Decrypted temp file was not cleaned up after processing failure"
            )
            for p in (id_tmp, selfie_tmp):
                if os.path.exists(p):
                    os.unlink(p)

    # ------------------------------------------------------------------
    # TC-FV-035: Audit log created on success
    # ------------------------------------------------------------------
    @patch('applicant.face_verification_service.FaceComparisonService.compare_faces')
    @patch('applicant.face_verification_service.FaceComparisonService.detect_face')
    @patch('applicant.face_verification_service.FaceComparisonService.extract_face_from_document')
    @patch('applicant.face_verification_service.FaceComparisonService._decrypt_to_temp')
    @override_settings(
        MEDIA_ROOT=tempfile.gettempdir(),
        FACE_VERIFICATION={'AUTO_APPROVE_MAX_DISTANCE': 0.60, 'REVIEW_MAX_DISTANCE': 0.75}
    )
    def test_audit_log_created_on_success(
        self, mock_decrypt, mock_extract, mock_detect, mock_compare
    ):
        """TC-FV-035: Successful verification creates a FACE_VERIFY_SUCCESS AuditLog."""
        from applicant.face_verification_service import FaceComparisonService
        from loans.models import AuditLog, LoanDocument

        id_tmp = _write_tmp_image()
        selfie_tmp = _write_tmp_image()
        selfie_rel = os.path.relpath(selfie_tmp, tempfile.gettempdir())

        LoanDocument.objects.create(
            loan_application=self.application,
            document_type='buksu_id',
            file_path=os.path.relpath(id_tmp, tempfile.gettempdir()),
        )
        mock_decrypt.return_value = (id_tmp, None)
        mock_extract.return_value = {
            'success': True, 'face_path': id_tmp,
            'coordinates': {'x': 0, 'y': 0, 'width': 100, 'height': 100},
            'message': 'ok'
        }
        mock_detect.return_value = {
            'success': True, 'face_count': 1,
            'face_region': (0, 0, 100, 100), 'message': 'ok'
        }
        mock_compare.return_value = {
            'success': True, 'verified': True, 'distance': 0.25,
            'threshold': 0.68, 'similarity_percentage': 93.75,
            'model': 'ArcFace', 'distance_metric': 'cosine',
            'message': 'Face comparison completed successfully',
        }

        AuditLog.objects.filter(user=self.user, action_type='FACE_VERIFY_SUCCESS').delete()

        try:
            FaceComparisonService.verify_faces_for_application(
                self.application.id, captured_image_path=selfie_rel
            )
            self.assertTrue(
                AuditLog.objects.filter(
                    user=self.user, action_type='FACE_VERIFY_SUCCESS'
                ).exists(),
                "Expected FACE_VERIFY_SUCCESS audit log was not created"
            )
        finally:
            for p in (id_tmp, selfie_tmp):
                if os.path.exists(p):
                    os.unlink(p)


# ===========================================================================
# PART B — MediaPipeLivenessService / LivenessVerificationService
# ===========================================================================

class TestEARCalculation(TestCase):
    """
    TC-LC-001 through TC-LC-003
    Unit tests for MediaPipeLivenessService._ear() — Eye Aspect Ratio.
    """

    def setUp(self):
        from applicant.liveness_service import MediaPipeLivenessService
        self.ear = MediaPipeLivenessService._ear

    def test_wide_open_eye_has_high_ear(self):
        """TC-LC-001: Open eye landmarks → EAR > 0.21 threshold."""
        landmarks = [
            (0.0,  0.0),
            (0.25, 0.5),
            (0.75, 0.5),
            (1.0,  0.0),
            (0.75,-0.5),
            (0.25,-0.5),
        ]
        self.assertGreater(self.ear(landmarks), 0.21)

    def test_closed_eye_has_low_ear(self):
        """TC-LC-002: Squished eye landmarks → EAR < 0.21 threshold."""
        landmarks = [
            (0.0,  0.0),
            (0.25, 0.005),
            (0.75, 0.005),
            (1.0,  0.0),
            (0.75,-0.005),
            (0.25,-0.005),
        ]
        self.assertLess(self.ear(landmarks), 0.21)

    def test_zero_width_eye_returns_zero_without_exception(self):
        """TC-LC-003: All landmarks at origin → EAR=0.0, no ZeroDivisionError."""
        landmarks = [(0, 0)] * 6
        self.assertEqual(self.ear(landmarks), 0.0)


# ---------------------------------------------------------------------------

class TestHeadPose(TestCase):
    """
    TC-LC-004 through TC-LC-006
    Unit tests for MediaPipeLivenessService._head_pose()
    """

    def setUp(self):
        from applicant.liveness_service import MediaPipeLivenessService
        self.service = MediaPipeLivenessService.__new__(MediaPipeLivenessService)

    def _mat(self, data):
        m = MagicMock()
        m.data = data
        return m

    def _identity(self):
        return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]

    def test_identity_matrix_gives_zero_angles(self):
        """TC-LC-004: Identity rotation → yaw≈0, pitch≈0, roll≈0."""
        pose = self.service._head_pose(self._mat(self._identity()))
        self.assertAlmostEqual(pose['yaw'],   0.0, places=3)
        self.assertAlmostEqual(pose['pitch'], 0.0, places=3)
        self.assertAlmostEqual(pose['roll'],  0.0, places=3)

    def test_90_degree_yaw(self):
        """TC-LC-005: 90° Y-axis rotation → |yaw| ≈ 90°."""
        # Rotation matrix for 90° yaw (around Y)
        data = [
            0, 0, 1, 0,
            0, 1, 0, 0,
           -1, 0, 0, 0,
            0, 0, 0, 1,
        ]
        pose = self.service._head_pose(self._mat(data))
        self.assertAlmostEqual(abs(pose['yaw']), 90.0, delta=1.0)

    def test_invalid_matrix_returns_zeros(self):
        """TC-LC-006: Empty matrix data → all angles=0.0 without exception."""
        m = MagicMock()
        m.data = []
        pose = self.service._head_pose(m)
        self.assertEqual(pose['yaw'],   0.0)
        self.assertEqual(pose['pitch'], 0.0)
        self.assertEqual(pose['roll'],  0.0)


# ---------------------------------------------------------------------------

class TestVerifyLiveness(TestCase):
    """
    TC-LC-008 through TC-LC-018
    Unit tests for MediaPipeLivenessService.verify_liveness()
    The MediaPipe model is bypassed via mocking.
    """

    def _make_service(self):
        from applicant.liveness_service import MediaPipeLivenessService
        svc = MediaPipeLivenessService.__new__(MediaPipeLivenessService)
        svc._mp = MagicMock()
        svc._landmarker = MagicMock()
        return svc

    def _fake_lm(self, x=0.5, y=0.5):
        lm = MagicMock()
        lm.x = x
        lm.y = y
        return lm

    def _landmarks(self, n=478, x=0.5, y=0.5):
        return [self._fake_lm(x, y) for _ in range(n)]

    # Open-eye coords that give EAR > 0.21
    OPEN_EYE = [(0.0,0.0),(0.25,0.5),(0.75,0.5),(1.0,0.0),(0.75,-0.5),(0.25,-0.5)]
    CLOSED_EYE = [(0.0,0.0),(0.25,0.005),(0.75,0.005),(1.0,0.0),(0.75,-0.005),(0.25,-0.005)]

    # ------------------------------------------------------------------
    # TC-LC-008: Image file not found
    # ------------------------------------------------------------------
    def test_missing_image_file(self):
        """TC-LC-008: Non-existent path → is_live=False, 'not found' in error."""
        svc = self._make_service()
        result = svc.verify_liveness('/no/such/file.jpg', 'combined')
        self.assertFalse(result.is_live)
        self.assertIn('not found', result.error_message.lower())

    # ------------------------------------------------------------------
    # TC-LC-009: cv2 cannot decode the file
    # ------------------------------------------------------------------
    @patch('applicant.liveness_service.cv2.imread', return_value=None)
    def test_unreadable_image(self, _):
        """TC-LC-009: cv2.imread returns None → is_live=False, load error."""
        svc = self._make_service()
        path = _write_tmp_image()
        try:
            result = svc.verify_liveness(path, 'combined')
            self.assertFalse(result.is_live)
            self.assertIn('Could not load image', result.error_message)
        finally:
            os.unlink(path)

    # ------------------------------------------------------------------
    # TC-LC-010: No face detected by MediaPipe
    # ------------------------------------------------------------------
    def test_no_face_detected_by_mediapipe(self):
        """TC-LC-010: Empty face_landmarks list → is_live=False, face_detected=False."""
        svc = self._make_service()
        path = _write_tmp_image()
        mp_result = MagicMock()
        mp_result.face_landmarks = []
        svc._landmarker.detect.return_value = mp_result

        try:
            result = svc.verify_liveness(path, 'combined')
            self.assertFalse(result.is_live)
            self.assertFalse(result.details.get('face_detected', True))
        finally:
            os.unlink(path)

    # ------------------------------------------------------------------
    # TC-LC-011: Eyes open with natural pose — blink check passes
    # ------------------------------------------------------------------
    def test_eyes_open_flag_in_details(self):
        """TC-LC-011: Open-eye coords → details['eyes']['eyes_open'] is True."""
        svc = self._make_service()
        path = _write_tmp_image()
        mp_result = MagicMock()
        mp_result.face_landmarks = [self._landmarks()]
        mp_result.facial_transformation_matrixes = [
            MagicMock(data=[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
        ]
        svc._landmarker.detect.return_value = mp_result

        with patch.object(svc, '_eye_coords', return_value=(self.OPEN_EYE, self.OPEN_EYE)):
            with patch.object(svc, '_head_pose', return_value={'yaw':0.,'pitch':0.,'roll':0.}):
                try:
                    result = svc.verify_liveness(path, 'combined')
                    self.assertTrue(result.details['eyes']['eyes_open'])
                finally:
                    os.unlink(path)

    # ------------------------------------------------------------------
    # TC-LC-012: Eyes closed — blink check fails
    # ------------------------------------------------------------------
    def test_eyes_closed_fails_blink_check(self):
        """TC-LC-012: Closed-eye coords → details['eyes']['eyes_open'] is False."""
        svc = self._make_service()
        path = _write_tmp_image()
        mp_result = MagicMock()
        mp_result.face_landmarks = [self._landmarks()]
        mp_result.facial_transformation_matrixes = [
            MagicMock(data=[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
        ]
        svc._landmarker.detect.return_value = mp_result

        with patch.object(svc, '_eye_coords', return_value=(self.CLOSED_EYE, self.CLOSED_EYE)):
            with patch.object(svc, '_head_pose', return_value={'yaw':0.,'pitch':0.,'roll':0.}):
                try:
                    result = svc.verify_liveness(path, 'combined')
                    self.assertFalse(result.details['eyes']['eyes_open'])
                finally:
                    os.unlink(path)

    # ------------------------------------------------------------------
    # TC-LC-013: Extreme yaw — head pose fails
    # ------------------------------------------------------------------
    def test_extreme_yaw_fails_head_pose_check(self):
        """TC-LC-013: Yaw=45° (> 30° threshold) → has_natural_pose=False."""
        svc = self._make_service()
        path = _write_tmp_image()
        mp_result = MagicMock()
        mp_result.face_landmarks = [self._landmarks()]
        mp_result.facial_transformation_matrixes = []
        svc._landmarker.detect.return_value = mp_result

        with patch.object(svc, '_eye_coords', return_value=(self.OPEN_EYE, self.OPEN_EYE)):
            with patch.object(svc, '_head_pose', return_value={'yaw':45.,'pitch':0.,'roll':0.}):
                try:
                    result = svc.verify_liveness(path, 'combined')
                    self.assertFalse(result.details['head_pose']['has_natural_pose'])
                finally:
                    os.unlink(path)

    # ------------------------------------------------------------------
    # TC-LC-014: Face too small
    # ------------------------------------------------------------------
    def test_small_face_fails_size_check(self):
        """TC-LC-014: All landmarks clustered at 0.5,0.5 → face_size_ok=False."""
        svc = self._make_service()
        path = _write_tmp_image(400, 400)
        # All at same point → face_w ≈ 0, face_h ≈ 0
        mp_result = MagicMock()
        mp_result.face_landmarks = [self._landmarks(x=0.5, y=0.5)]
        mp_result.facial_transformation_matrixes = []
        svc._landmarker.detect.return_value = mp_result

        with patch.object(svc, '_eye_coords', return_value=(self.OPEN_EYE, self.OPEN_EYE)):
            with patch.object(svc, '_head_pose', return_value={'yaw':0.,'pitch':0.,'roll':0.}):
                try:
                    result = svc.verify_liveness(path, 'combined')
                    self.assertFalse(result.details['face_quality']['size_ok'])
                finally:
                    os.unlink(path)

    # ------------------------------------------------------------------
    # TC-LC-015: method='blink' — only 2 checks total (blink + face_size)
    # ------------------------------------------------------------------
    def test_blink_method_has_two_total_checks(self):
        """TC-LC-015: method='blink' → checks_summary.total == 2."""
        svc = self._make_service()
        path = _write_tmp_image()
        mp_result = MagicMock()
        mp_result.face_landmarks = [self._landmarks()]
        mp_result.facial_transformation_matrixes = []
        svc._landmarker.detect.return_value = mp_result

        with patch.object(svc, '_eye_coords', return_value=(self.OPEN_EYE, self.OPEN_EYE)):
            with patch.object(svc, '_head_pose', return_value={'yaw':50.,'pitch':30.,'roll':0.}):
                try:
                    result = svc.verify_liveness(path, 'blink')
                    self.assertEqual(result.details['checks_summary']['total'], 2)
                finally:
                    os.unlink(path)

    # ------------------------------------------------------------------
    # TC-LC-016: method='head_turn' — only 2 checks total (head_pose + face_size)
    # ------------------------------------------------------------------
    def test_head_turn_method_has_two_total_checks(self):
        """TC-LC-016: method='head_turn' → checks_summary.total == 2."""
        svc = self._make_service()
        path = _write_tmp_image()
        mp_result = MagicMock()
        mp_result.face_landmarks = [self._landmarks()]
        mp_result.facial_transformation_matrixes = []
        svc._landmarker.detect.return_value = mp_result

        with patch.object(svc, '_eye_coords', return_value=(self.CLOSED_EYE, self.CLOSED_EYE)):
            with patch.object(svc, '_head_pose', return_value={'yaw':5.,'pitch':2.,'roll':0.}):
                try:
                    result = svc.verify_liveness(path, 'head_turn')
                    self.assertEqual(result.details['checks_summary']['total'], 2)
                finally:
                    os.unlink(path)

    # ------------------------------------------------------------------
    # TC-LC-017: method='combined' — 3 total checks
    # ------------------------------------------------------------------
    def test_combined_method_has_three_total_checks(self):
        """TC-LC-017: method='combined' → checks_summary.total == 3."""
        svc = self._make_service()
        path = _write_tmp_image()
        mp_result = MagicMock()
        mp_result.face_landmarks = [self._landmarks()]
        mp_result.facial_transformation_matrixes = []
        svc._landmarker.detect.return_value = mp_result

        with patch.object(svc, '_eye_coords', return_value=(self.OPEN_EYE, self.OPEN_EYE)):
            with patch.object(svc, '_head_pose', return_value={'yaw':0.,'pitch':0.,'roll':0.}):
                try:
                    result = svc.verify_liveness(path, 'combined')
                    self.assertEqual(result.details['checks_summary']['total'], 3)
                finally:
                    os.unlink(path)

    # ------------------------------------------------------------------
    # TC-LC-018: Exception inside MediaPipe → graceful error result
    # ------------------------------------------------------------------
    def test_mediapipe_exception_returns_error(self):
        """TC-LC-018: Exception in landmarker.detect() → is_live=False, error_message set."""
        svc = self._make_service()
        path = _write_tmp_image()
        svc._landmarker.detect.side_effect = RuntimeError('MediaPipe internal error')

        try:
            result = svc.verify_liveness(path, 'combined')
            self.assertFalse(result.is_live)
            self.assertIsNotNone(result.error_message)
            self.assertIn('Error', result.error_message)
        finally:
            os.unlink(path)


# ---------------------------------------------------------------------------

class TestLivenessVerificationService(TestCase):
    """
    TC-LC-019 through TC-LC-025
    Integration tests for LivenessVerificationService.verify_liveness_for_application()
    """

    def setUp(self):
        self.user = _make_applicant_user('liveness@test.com')
        self.application = _make_loan_application(self.user)

    def _passing_result(self):
        from applicant.liveness_service import LivenessResult
        return LivenessResult(
            is_live=True, confidence=85.0, method='combined',
            details={
                'face_detected': True,
                'eyes': {'eyes_open': True, 'left_ear': 0.30, 'right_ear': 0.29,
                         'avg_ear': 0.295, 'ear_threshold': 0.21},
                'head_pose': {'yaw': 2.0, 'pitch': 1.0, 'roll': 0.5, 'has_natural_pose': True},
                'face_quality': {'size_ok': True, 'face_width': 120.0, 'face_height': 130.0,
                                 'min_required_size': 60.0},
                'checks_summary': {'passed': 3, 'total': 3, 'pass_rate': '100.0%'},
            },
            error_message=None,
        )

    def _failing_result(self):
        from applicant.liveness_service import LivenessResult
        return LivenessResult(
            is_live=False, confidence=40.0, method='combined',
            details={},
            error_message='Liveness check failed.',
        )

    # ------------------------------------------------------------------
    # TC-LC-019: Application not found
    # ------------------------------------------------------------------
    @patch('applicant.liveness_service.MediaPipeLivenessService.__init__', return_value=None)
    def test_nonexistent_application(self, _):
        """TC-LC-019: Non-existent app_id → returns error dict (no exception raised)."""
        from applicant.liveness_service import LivenessVerificationService
        result = LivenessVerificationService.verify_liveness_for_application(
            application_id=999999,
            image_path='/some/path.jpg',
            method='combined'
        )
        self.assertFalse(result['success'])
        self.assertFalse(result['is_live'])
        self.assertIn('not found', result.get('error_message', '').lower())

    # ------------------------------------------------------------------
    # TC-LC-020: Liveness passes — status=Verified, DB record created
    # ------------------------------------------------------------------
    @patch('applicant.liveness_service.MediaPipeLivenessService')
    @override_settings(LIVENESS_DETECTION={'MIN_CONFIDENCE_THRESHOLD': 70, 'ENABLED': True})
    def test_liveness_verified_creates_db_record(self, MockDetector):
        """TC-LC-020: Confidence=85% → check_status=Verified, verified_at set."""
        from applicant.liveness_service import LivenessVerificationService
        from loans.models import LivenessCheck

        MockDetector.return_value.verify_liveness.return_value = self._passing_result()

        path = _write_tmp_image()
        try:
            result = LivenessVerificationService.verify_liveness_for_application(
                self.application.id, path, 'combined'
            )
            self.assertTrue(result['is_live'])
            self.assertEqual(result['check_status'], 'Verified')

            db = LivenessCheck.objects.get(loan_application=self.application)
            self.assertEqual(db.check_status, 'Verified')
            self.assertIsNotNone(db.verified_at)
        finally:
            os.unlink(path)

    # ------------------------------------------------------------------
    # TC-LC-021: Confidence below threshold → status=Failed, verified_at null
    # ------------------------------------------------------------------
    @patch('applicant.liveness_service.MediaPipeLivenessService')
    @override_settings(LIVENESS_DETECTION={'MIN_CONFIDENCE_THRESHOLD': 70, 'ENABLED': True})
    def test_liveness_failed_below_threshold(self, MockDetector):
        """TC-LC-021: Confidence=40% (< 70 threshold) → check_status=Failed, verified_at=None."""
        from applicant.liveness_service import LivenessVerificationService
        from loans.models import LivenessCheck

        MockDetector.return_value.verify_liveness.return_value = self._failing_result()

        path = _write_tmp_image()
        try:
            result = LivenessVerificationService.verify_liveness_for_application(
                self.application.id, path, 'combined'
            )
            self.assertEqual(result['check_status'], 'Failed')
            self.assertFalse(result['success'])

            db = LivenessCheck.objects.get(loan_application=self.application)
            self.assertEqual(db.check_status, 'Failed')
            self.assertIsNone(db.verified_at)
        finally:
            os.unlink(path)

    # ------------------------------------------------------------------
    # TC-LC-022: Previous LivenessCheck replaced on second call
    # ------------------------------------------------------------------
    @patch('applicant.liveness_service.MediaPipeLivenessService')
    @override_settings(LIVENESS_DETECTION={'MIN_CONFIDENCE_THRESHOLD': 70, 'ENABLED': True})
    def test_old_liveness_check_replaced(self, MockDetector):
        """TC-LC-022: Second call deletes old LivenessCheck; exactly 1 record remains."""
        from applicant.liveness_service import LivenessVerificationService
        from loans.models import LivenessCheck

        MockDetector.return_value.verify_liveness.return_value = self._passing_result()

        path = _write_tmp_image()
        try:
            LivenessVerificationService.verify_liveness_for_application(
                self.application.id, path, 'combined'
            )
            LivenessVerificationService.verify_liveness_for_application(
                self.application.id, path, 'combined'
            )
            count = LivenessCheck.objects.filter(loan_application=self.application).count()
            self.assertEqual(count, 1)
        finally:
            os.unlink(path)

    # ------------------------------------------------------------------
    # TC-LC-023: Detection details stored as JSON-parseable string
    # ------------------------------------------------------------------
    @patch('applicant.liveness_service.MediaPipeLivenessService')
    @override_settings(LIVENESS_DETECTION={'MIN_CONFIDENCE_THRESHOLD': 70, 'ENABLED': True})
    def test_detection_details_stored_as_json(self, MockDetector):
        """TC-LC-023: detection_details field is valid JSON after save."""
        from applicant.liveness_service import LivenessVerificationService
        from loans.models import LivenessCheck

        MockDetector.return_value.verify_liveness.return_value = self._passing_result()

        path = _write_tmp_image()
        try:
            LivenessVerificationService.verify_liveness_for_application(
                self.application.id, path, 'combined'
            )
            db = LivenessCheck.objects.get(loan_application=self.application)
            parsed = json.loads(db.detection_details)
            self.assertTrue(parsed['face_detected'])
        finally:
            os.unlink(path)

    # ------------------------------------------------------------------
    # TC-LC-024: Audit log created on success
    # ------------------------------------------------------------------
    @patch('applicant.liveness_service.MediaPipeLivenessService')
    @override_settings(LIVENESS_DETECTION={'MIN_CONFIDENCE_THRESHOLD': 70, 'ENABLED': True})
    def test_audit_log_on_liveness_success(self, MockDetector):
        """TC-LC-024: Passing check creates LIVENESS_SUCCESS AuditLog."""
        from applicant.liveness_service import LivenessVerificationService
        from loans.models import AuditLog

        MockDetector.return_value.verify_liveness.return_value = self._passing_result()
        AuditLog.objects.filter(user=self.user, action_type='LIVENESS_SUCCESS').delete()

        path = _write_tmp_image()
        try:
            LivenessVerificationService.verify_liveness_for_application(
                self.application.id, path, 'combined'
            )
            self.assertTrue(
                AuditLog.objects.filter(
                    user=self.user, action_type='LIVENESS_SUCCESS'
                ).exists()
            )
        finally:
            os.unlink(path)

    # ------------------------------------------------------------------
    # TC-LC-025: Audit log created on failure
    # ------------------------------------------------------------------
    @patch('applicant.liveness_service.MediaPipeLivenessService')
    @override_settings(LIVENESS_DETECTION={'MIN_CONFIDENCE_THRESHOLD': 70, 'ENABLED': True})
    def test_audit_log_on_liveness_failure(self, MockDetector):
        """TC-LC-025: Failing check creates LIVENESS_FAIL AuditLog."""
        from applicant.liveness_service import LivenessVerificationService
        from loans.models import AuditLog

        MockDetector.return_value.verify_liveness.return_value = self._failing_result()
        AuditLog.objects.filter(user=self.user, action_type='LIVENESS_FAIL').delete()

        path = _write_tmp_image()
        try:
            LivenessVerificationService.verify_liveness_for_application(
                self.application.id, path, 'combined'
            )
            self.assertTrue(
                AuditLog.objects.filter(
                    user=self.user, action_type='LIVENESS_FAIL'
                ).exists()
            )
        finally:
            os.unlink(path)


# ===========================================================================
# PART C — API Endpoint Tests
# ===========================================================================

class TestFaceCaptureAPI(APITestCase):
    """
    TC-API-001 through TC-API-005
    POST /api/applicant/applications/<app_id>/face-capture/
    """

    def setUp(self):
        self.user = _make_applicant_user('api_face@test.com')
        self.application = _make_loan_application(self.user)
        self.url = reverse('applicant:face_capture', kwargs={'app_id': self.application.id})

    # ------------------------------------------------------------------
    # TC-API-001: Unauthenticated → 401
    # ------------------------------------------------------------------
    def test_unauthenticated_returns_401(self):
        """TC-API-001: POST with no JWT → 401 Unauthorized."""
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ------------------------------------------------------------------
    # TC-API-002: Non-applicant role → 403
    # ------------------------------------------------------------------
    def test_non_applicant_role_returns_403(self):
        """TC-API-002: User with 'Bookkeeper' role → 403 Forbidden."""
        from users.models import Role
        role, _ = Role.objects.get_or_create(name='Bookkeeper')
        staff = User.objects.create_user(
            email='bk@test.com', password='StaffPass1!',
            firstname='Book', lastname='Keeper',
        )
        staff.role = role
        staff.save()
        response = self.client.post(self.url, **_jwt_for(staff))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # TC-API-003: No image file → 400
    # ------------------------------------------------------------------
    def test_missing_image_returns_400(self):
        """TC-API-003: POST with no 'image' field → 400 Bad Request."""
        response = self.client.post(self.url, data={}, **_jwt_for(self.user))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ------------------------------------------------------------------
    # TC-API-004: Non-existent application ID → 404
    # ------------------------------------------------------------------
    def test_invalid_application_id_returns_404(self):
        """TC-API-004: app_id not owned by this user → 404 Not Found."""
        url = reverse('applicant:face_capture', kwargs={'app_id': 999999})
        image = SimpleUploadedFile('selfie.jpg', _make_dummy_jpeg(), content_type='image/jpeg')
        response = self.client.post(url, data={'image': image}, **_jwt_for(self.user))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # ------------------------------------------------------------------
    # TC-API-005: Valid image → 201 Verified or 200 Needs Review
    # ------------------------------------------------------------------
    @patch('applicant.face_verification_service.FaceComparisonService.verify_faces_for_application')
    @patch('applicant.views.FaceVerificationService.save_face_capture')
    @override_settings(MEDIA_ROOT=tempfile.gettempdir())
    def test_valid_image_returns_success(self, mock_save, mock_verify):
        """TC-API-005: Valid JPEG → 201 (Verified) or 200 (Needs Review)."""
        from loans.models import FaceVerification

        fv = FaceVerification(
            loan_application=self.application,
            verification_status='Verified',
            captured_image_path='applicant/faces/test.jpg',
            face_detected_in_id=True,
            face_detected_in_selfie=True,
            is_match=True,
            similarity_score=Decimal('92.50'),
            error_message=None,
        )
        fv.id = 1
        fv.verified_at = timezone.now()
        mock_save.return_value = fv
        mock_verify.return_value = fv

        image = SimpleUploadedFile('selfie.jpg', _make_dummy_jpeg(), content_type='image/jpeg')
        response = self.client.post(
            self.url, data={'image': image}, **_jwt_for(self.user)
        )
        self.assertIn(response.status_code, [
            status.HTTP_200_OK, status.HTTP_201_CREATED
        ])


class TestLivenessCheckAPI(APITestCase):
    """
    TC-API-006 through TC-API-012
    POST /api/applicant/applications/<app_id>/liveness-check/
    """

    def setUp(self):
        self.user = _make_applicant_user('api_liveness@test.com')
        self.application = _make_loan_application(self.user)
        self.url = reverse('applicant:liveness_check', kwargs={'app_id': self.application.id})

    # ------------------------------------------------------------------
    # TC-API-006: Unauthenticated → 401
    # ------------------------------------------------------------------
    def test_unauthenticated_returns_401(self):
        """TC-API-006: No JWT → 401 Unauthorized."""
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ------------------------------------------------------------------
    # TC-API-007: No image file → 400
    # ------------------------------------------------------------------
    def test_no_image_returns_400(self):
        """TC-API-007: POST without image → 400 Bad Request."""
        response = self.client.post(self.url, data={}, **_jwt_for(self.user))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ------------------------------------------------------------------
    # TC-API-008: Invalid method value → 400
    # ------------------------------------------------------------------
    def test_invalid_method_returns_400(self):
        """TC-API-008: method='unknown' → 400 Bad Request (not in valid_methods list)."""
        image = SimpleUploadedFile('frame.jpg', _make_dummy_jpeg(), content_type='image/jpeg')
        response = self.client.post(
            self.url,
            data={'image': image, 'method': 'unknown_method'},
            **_jwt_for(self.user)
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ------------------------------------------------------------------
    # TC-API-009: Non-image extension → 400
    # ------------------------------------------------------------------
    def test_non_image_extension_rejected(self):
        """TC-API-009: .txt file uploaded → 400 (extension not in allowed list)."""
        bad_file = SimpleUploadedFile('frame.txt', b'not an image', content_type='text/plain')
        response = self.client.post(
            self.url,
            data={'image': bad_file, 'method': 'combined'},
            **_jwt_for(self.user)
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ------------------------------------------------------------------
    # TC-API-010: Liveness passes → 201
    # ------------------------------------------------------------------
    @patch('applicant.liveness_service.LivenessVerificationService.verify_liveness_for_application')
    @override_settings(MEDIA_ROOT=tempfile.gettempdir())
    def test_liveness_pass_returns_201(self, mock_verify):
        """TC-API-010: is_live=True, check_status='Verified' → 201 Created."""
        mock_verify.return_value = {
            'success': True, 'is_live': True, 'confidence': 85.0,
            'check_status': 'Verified', 'method': 'combined',
            'details': {}, 'error_message': None,
            'liveness_check_id': 42, 'threshold': 70.0,
        }
        image = SimpleUploadedFile('frame.jpg', _make_dummy_jpeg(), content_type='image/jpeg')
        response = self.client.post(
            self.url,
            data={'image': image, 'method': 'combined'},
            **_jwt_for(self.user)
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data.get('is_live', False))

    # ------------------------------------------------------------------
    # TC-API-011: Liveness fails → 422
    # ------------------------------------------------------------------
    @patch('applicant.liveness_service.LivenessVerificationService.verify_liveness_for_application')
    @override_settings(MEDIA_ROOT=tempfile.gettempdir())
    def test_liveness_fail_returns_422(self, mock_verify):
        """TC-API-011: is_live=False → 422 Unprocessable Entity."""
        mock_verify.return_value = {
            'success': False, 'is_live': False, 'confidence': 35.0,
            'check_status': 'Failed', 'method': 'combined',
            'details': {}, 'error_message': 'Liveness check failed.',
            'liveness_check_id': 43, 'threshold': 70.0,
        }
        image = SimpleUploadedFile('frame.jpg', _make_dummy_jpeg(), content_type='image/jpeg')
        response = self.client.post(
            self.url,
            data={'image': image, 'method': 'combined'},
            **_jwt_for(self.user)
        )
        self.assertEqual(response.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)

    # ------------------------------------------------------------------
    # TC-API-012: Response has all expected fields
    # ------------------------------------------------------------------
    @patch('applicant.liveness_service.LivenessVerificationService.verify_liveness_for_application')
    @override_settings(MEDIA_ROOT=tempfile.gettempdir())
    def test_response_has_expected_fields(self, mock_verify):
        """TC-API-012: 201 response contains id, method, status, is_live, confidence, threshold."""
        mock_verify.return_value = {
            'success': True, 'is_live': True, 'confidence': 78.5,
            'check_status': 'Verified', 'method': 'blink',
            'details': {'checks_summary': {'passed': 2, 'total': 2}},
            'error_message': None, 'liveness_check_id': 99, 'threshold': 70.0,
        }
        image = SimpleUploadedFile('frame.jpg', _make_dummy_jpeg(), content_type='image/jpeg')
        response = self.client.post(
            self.url,
            data={'image': image, 'method': 'blink'},
            **_jwt_for(self.user)
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        for field in ('id', 'method', 'status', 'is_live', 'confidence', 'threshold'):
            self.assertIn(field, response.data, f"Missing field '{field}' in response")


class TestLivenessVideoAPI(APITestCase):
    """
    TC-API-013 through TC-API-017
    POST /api/applicant/applications/<app_id>/liveness-video/
    """

    def setUp(self):
        self.user = _make_applicant_user('api_video@test.com')
        self.application = _make_loan_application(self.user)
        self.url = reverse('applicant:liveness_video', kwargs={'app_id': self.application.id})

    # ------------------------------------------------------------------
    # TC-API-013: Unauthenticated → 401
    # ------------------------------------------------------------------
    def test_unauthenticated_returns_401(self):
        """TC-API-013: No JWT → 401 Unauthorized."""
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ------------------------------------------------------------------
    # TC-API-014: No video file → 400
    # ------------------------------------------------------------------
    def test_no_video_returns_400(self):
        """TC-API-014: POST without 'video' field → 400 Bad Request."""
        response = self.client.post(self.url, data={}, **_jwt_for(self.user))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ------------------------------------------------------------------
    # TC-API-015: Non-video extension (e.g. .jpg) → 400
    # ------------------------------------------------------------------
    def test_non_video_extension_rejected(self):
        """TC-API-015: .jpg file sent to liveness-video → 400 (extension not in allowed list)."""
        bad_file = SimpleUploadedFile('photo.jpg', _make_dummy_jpeg(), content_type='image/jpeg')
        response = self.client.post(
            self.url, data={'video': bad_file}, **_jwt_for(self.user)
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ------------------------------------------------------------------
    # TC-API-016: 60%+ frames pass → 201
    # ------------------------------------------------------------------
    @patch('applicant.liveness_service.LivenessVerificationService.verify_liveness_for_application')
    @patch('cv2.VideoCapture')
    @override_settings(MEDIA_ROOT=tempfile.gettempdir())
    def test_majority_frames_pass_returns_201(self, mock_cap_cls, mock_verify):
        """TC-API-016: 5/5 frames pass (100%) → overall_passed=True, 201."""
        frame = np.zeros((480, 640, 3), dtype=np.uint8)

        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        # Return 5 for all cap.get() calls (fps, total_frames, width, height, orientation)
        mock_cap.get.return_value = 5.0
        mock_cap.read.side_effect = [(True, frame)] * 10 + [(False, None)]
        mock_cap_cls.return_value = mock_cap

        mock_verify.return_value = {
            'success': True, 'is_live': True, 'confidence': 82.0,
            'check_status': 'Verified', 'method': 'combined',
            'details': {}, 'error_message': None, 'liveness_check_id': 7,
        }

        fake_video = SimpleUploadedFile(
            'liveness.mp4', b'\x00' * 512, content_type='video/mp4'
        )
        response = self.client.post(
            self.url, data={'video': fake_video}, **_jwt_for(self.user)
        )
        self.assertIn(response.status_code, [
            status.HTTP_200_OK, status.HTTP_201_CREATED
        ])

    # ------------------------------------------------------------------
    # TC-API-017: Fewer than 60% frames pass → 422
    # ------------------------------------------------------------------
    @patch('applicant.liveness_service.LivenessVerificationService.verify_liveness_for_application')
    @patch('cv2.VideoCapture')
    @override_settings(MEDIA_ROOT=tempfile.gettempdir())
    def test_minority_frames_pass_returns_422(self, mock_cap_cls, mock_verify):
        """TC-API-017: 1/5 frames pass (20%) → overall_passed=False, 422."""
        frame = np.zeros((480, 640, 3), dtype=np.uint8)

        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        mock_cap.get.return_value = 5.0
        mock_cap.read.side_effect = [(True, frame)] * 10 + [(False, None)]
        mock_cap_cls.return_value = mock_cap

        pass_result = {
            'success': True, 'is_live': True, 'confidence': 80.0,
            'check_status': 'Verified', 'details': {}, 'error_message': None,
            'liveness_check_id': 10,
        }
        fail_result = {
            'success': False, 'is_live': False, 'confidence': 25.0,
            'check_status': 'Failed', 'details': {}, 'error_message': 'Failed',
            'liveness_check_id': 11,
        }
        # 1 pass then 4 fails (repeated for all frames)
        mock_verify.side_effect = [pass_result] + [fail_result] * 20

        fake_video = SimpleUploadedFile(
            'liveness.mp4', b'\x00' * 512, content_type='video/mp4'
        )
        response = self.client.post(
            self.url, data={'video': fake_video}, **_jwt_for(self.user)
        )
        self.assertEqual(response.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)


class TestVerificationStatusAPI(APITestCase):
    """
    TC-API-018 through TC-API-021
    GET /api/applicant/applications/<app_id>/verification-status/
    """

    def setUp(self):
        self.user = _make_applicant_user('api_status@test.com')
        self.application = _make_loan_application(self.user)
        self.url = reverse(
            'applicant:verification_status', kwargs={'app_id': self.application.id}
        )

    # ------------------------------------------------------------------
    # TC-API-018: Unauthenticated → 401
    # ------------------------------------------------------------------
    def test_unauthenticated_returns_401(self):
        """TC-API-018: No JWT → 401 Unauthorized."""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ------------------------------------------------------------------
    # TC-API-019: Fresh application — nothing verified yet
    # ------------------------------------------------------------------
    def test_no_verification_returns_not_completed(self):
        """TC-API-019: No records → face_capture.completed=False, liveness_check.completed=False."""
        response = self.client.get(self.url, **_jwt_for(self.user))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['face_capture']['completed'])
        self.assertFalse(response.data['liveness_check']['completed'])

    # ------------------------------------------------------------------
    # TC-API-020: Verified face capture reflected in status
    # ------------------------------------------------------------------
    def test_verified_face_capture_reflected(self):
        """TC-API-020: FaceVerification(status=Verified) → face_capture.verified=True."""
        from loans.models import FaceVerification
        FaceVerification.objects.create(
            loan_application=self.application,
            verification_status='Verified',
            is_match=True,
            face_detected_in_id=True,
            face_detected_in_selfie=True,
        )
        response = self.client.get(self.url, **_jwt_for(self.user))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['face_capture']['completed'])
        self.assertTrue(response.data['face_capture']['verified'])

    # ------------------------------------------------------------------
    # TC-API-021: Verified liveness check reflected in status
    # ------------------------------------------------------------------
    def test_verified_liveness_reflected(self):
        """TC-API-021: LivenessCheck(status=Verified) → liveness_check.verified=True."""
        from loans.models import LivenessCheck
        LivenessCheck.objects.create(
            loan_application=self.application,
            check_status='Verified',
            confidence_score=Decimal('88.00'),
            method='combined',
        )
        response = self.client.get(self.url, **_jwt_for(self.user))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['liveness_check']['completed'])
        self.assertTrue(response.data['liveness_check']['verified'])
