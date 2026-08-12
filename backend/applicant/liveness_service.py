"""
Liveness Detection Service using MediaPipe FaceLandmarker (Tasks API)

Uses MediaPipe's Tasks API (mediapipe >= 0.10.14) for face landmark detection,
eye blink detection via Eye Aspect Ratio, and head pose estimation.

Dependencies:
- mediapipe >= 0.10.14
- opencv-contrib-python (cv2)
- numpy
"""

import os
import cv2
import numpy as np
import logging
from decimal import Decimal
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger('liveness_detection')

# Path to the FaceLandmarker model file (downloaded once at setup)
_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'face_landmarker.task')


class LivenessMethod(Enum):
    BLINK = 'blink'
    HEAD_TURN = 'head_turn'
    HEAD_NOD = 'head_nod'
    COMBINED = 'combined'


@dataclass
class LivenessResult:
    is_live: bool
    confidence: float
    method: str
    details: Dict
    error_message: Optional[str] = None


class MediaPipeLivenessService:
    """
    Liveness detection using MediaPipe FaceLandmarker Tasks API.

    Checks each video frame for:
    1. Eye Aspect Ratio (EAR) — eyes open vs closed
    2. Head pose — natural frontal position
    3. Face size — not too small / too far away
    """

    # MediaPipe Face Mesh landmark indices (same as legacy API)
    LEFT_EYE_INDICES  = [362, 385, 387, 263, 373, 380]
    RIGHT_EYE_INDICES = [33,  160, 158, 133, 153, 144]

    EAR_THRESHOLD = 0.21   # below this = eye closed
    HEAD_TURN_THRESHOLD = 30  # max yaw in degrees
    HEAD_PITCH_THRESHOLD = 20  # max pitch in degrees
    HEAD_ROLL_THRESHOLD  = 30  # max roll in degrees

    def __init__(self):
        import mediapipe as mp
        from mediapipe.tasks.python import vision as mp_vision
        from mediapipe.tasks.python.core import base_options as mp_base

        if not os.path.exists(_MODEL_PATH):
            raise RuntimeError(
                f"FaceLandmarker model not found at {_MODEL_PATH}. "
                "Download it from: https://storage.googleapis.com/mediapipe-models/"
                "face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
            )

        options = mp_vision.FaceLandmarkerOptions(
            base_options=mp_base.BaseOptions(model_asset_path=_MODEL_PATH),
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=True,
        )
        self._landmarker = mp_vision.FaceLandmarker.create_from_options(options)
        self._mp = mp

    def __del__(self):
        if hasattr(self, '_landmarker'):
            try:
                self._landmarker.close()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _ear(landmarks: List[Tuple[float, float]]) -> float:
        """Eye Aspect Ratio from 6 (x,y) landmark coords."""
        A = np.linalg.norm(np.array(landmarks[1]) - np.array(landmarks[5]))
        B = np.linalg.norm(np.array(landmarks[2]) - np.array(landmarks[4]))
        C = np.linalg.norm(np.array(landmarks[0]) - np.array(landmarks[3]))
        return (A + B) / (2.0 * C) if C > 0 else 0.0

    def _eye_coords(self, face_landmarks, h: int, w: int):
        """Extract left/right eye (x,y) coords from NormalizedLandmark list."""
        def pts(indices):
            return [(face_landmarks[i].x * w, face_landmarks[i].y * h) for i in indices]
        return pts(self.LEFT_EYE_INDICES), pts(self.RIGHT_EYE_INDICES)

    def _head_pose(self, transform_matrix) -> Dict[str, float]:
        """
        Derive yaw/pitch/roll from the 4×4 facial transformation matrix
        returned by FaceLandmarker.
        """
        try:
            R = np.array(transform_matrix.data, dtype=np.float64).reshape(4, 4)[:3, :3]
            sy = np.sqrt(R[0, 0] ** 2 + R[1, 0] ** 2)
            if sy >= 1e-6:
                x = np.arctan2(R[2, 1], R[2, 2])
                y = np.arctan2(-R[2, 0], sy)
                z = np.arctan2(R[1, 0], R[0, 0])
            else:
                x = np.arctan2(-R[1, 2], R[1, 1])
                y = np.arctan2(-R[2, 0], sy)
                z = 0.0
            return {
                'pitch': float(np.degrees(x)),
                'yaw':   float(np.degrees(y)),
                'roll':  float(np.degrees(z)),
            }
        except Exception:
            return {'pitch': 0.0, 'yaw': 0.0, 'roll': 0.0}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def verify_liveness(self, image_path: str, method: str = 'combined') -> LivenessResult:
        try:
            if not os.path.exists(image_path):
                return LivenessResult(
                    is_live=False, confidence=0.0, method=method,
                    details={}, error_message="Image file not found"
                )

            image = cv2.imread(image_path)
            if image is None:
                return LivenessResult(
                    is_live=False, confidence=0.0, method=method,
                    details={}, error_message="Could not load image"
                )

            h, w = image.shape[:2]
            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            import mediapipe as mp
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = self._landmarker.detect(mp_image)

            if not result.face_landmarks:
                return LivenessResult(
                    is_live=False, confidence=0.0, method=method,
                    details={'face_detected': False},
                    error_message="No face detected. Ensure your face is clearly visible."
                )

            landmarks = result.face_landmarks[0]   # NormalizedLandmark list
            checks_passed = 0
            total_checks = 0
            details = {'face_detected': True}

            # --- Check 1: Eye state (EAR) ---
            left_eye, right_eye = self._eye_coords(landmarks, h, w)
            left_ear  = float(self._ear(left_eye))
            right_ear = float(self._ear(right_eye))
            avg_ear   = (left_ear + right_ear) / 2.0
            eyes_open = bool(avg_ear > self.EAR_THRESHOLD)

            details['eyes'] = {
                'left_ear':  round(left_ear,  4),
                'right_ear': round(right_ear, 4),
                'avg_ear':   round(avg_ear,   4),
                'eyes_open': eyes_open,
                'ear_threshold': self.EAR_THRESHOLD,
            }

            if method in ('blink', 'combined'):
                total_checks += 1
                if eyes_open:
                    checks_passed += 1

            # --- Check 2: Head pose ---
            transform_matrix = (
                result.facial_transformation_matrixes[0]
                if result.facial_transformation_matrixes
                else None
            )
            pose = self._head_pose(transform_matrix)

            has_natural_pose = bool(
                abs(pose['yaw'])   < self.HEAD_TURN_THRESHOLD and
                abs(pose['pitch']) < self.HEAD_PITCH_THRESHOLD and
                abs(pose['roll'])  < self.HEAD_ROLL_THRESHOLD
            )
            details['head_pose'] = {**pose, 'has_natural_pose': has_natural_pose}

            if method in ('head_turn', 'head_nod', 'combined'):
                total_checks += 1
                if has_natural_pose:
                    checks_passed += 1

            # --- Check 3: Face size ---
            xs = [lm.x for lm in landmarks]
            ys = [lm.y for lm in landmarks]
            face_w = float((max(xs) - min(xs)) * w)
            face_h = float((max(ys) - min(ys)) * h)
            min_size = float(min(h, w) * 0.15)
            face_size_ok = bool(face_w > min_size and face_h > min_size)

            details['face_quality'] = {
                'face_width': round(face_w, 1),
                'face_height': round(face_h, 1),
                'min_required_size': round(min_size, 1),
                'size_ok': face_size_ok,
            }
            total_checks += 1
            if face_size_ok:
                checks_passed += 1

            # --- Aggregate ---
            base_confidence = float((checks_passed / total_checks * 100) if total_checks else 0)
            ear_bonus = float(min(10, (avg_ear - self.EAR_THRESHOLD) * 50)) if eyes_open else 0.0
            confidence = float(min(100.0, base_confidence + ear_bonus))
            is_live = bool(checks_passed >= total_checks * 0.6)

            details['checks_summary'] = {
                'passed': checks_passed,
                'total': total_checks,
                'pass_rate': f"{checks_passed / total_checks * 100:.1f}%",
            }

            logger.info(
                f"Liveness: is_live={is_live}, confidence={confidence:.1f}%, "
                f"eyes_open={eyes_open}(EAR={avg_ear:.3f}), "
                f"pose=yaw{pose['yaw']:.1f}/pitch{pose['pitch']:.1f}/roll{pose['roll']:.1f}, "
                f"face_size_ok={face_size_ok}, {checks_passed}/{total_checks} checks passed"
            )

            return LivenessResult(
                is_live=is_live,
                confidence=float(confidence),
                method=method,
                details=details,
                error_message=None if is_live else
                    "Liveness check failed. Try again with better lighting and face the camera directly."
            )

        except Exception as e:
            logger.error(f"Error in liveness verification: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return LivenessResult(
                is_live=False, confidence=0.0, method=method,
                details={}, error_message=f"Error during liveness verification: {str(e)}"
            )


class LivenessVerificationService:
    """High-level service for liveness verification integrated with loan applications."""

    @classmethod
    def get_min_confidence_threshold(cls) -> float:
        from django.conf import settings
        liveness_settings = getattr(settings, 'LIVENESS_DETECTION', {})
        return float(liveness_settings.get('MIN_CONFIDENCE_THRESHOLD', 70.0))

    MIN_CONFIDENCE_THRESHOLD = 70.0

    @classmethod
    def verify_liveness_for_application(
        cls, application_id: int, image_path: str, method: str = 'combined'
    ) -> Dict:
        from loans.models import LoanApplication, LivenessCheck
        from django.utils import timezone
        from django.conf import settings
        import json

        class _SafeEncoder(json.JSONEncoder):
            """Handles numpy scalars that slip through explicit float()/bool() casts."""
            def default(self, obj):
                if isinstance(obj, np.bool_):
                    return bool(obj)
                if isinstance(obj, np.integer):
                    return int(obj)
                if isinstance(obj, np.floating):
                    return float(obj)
                return super().default(obj)

        try:
            application = LoanApplication.objects.get(id=application_id)
            detector = MediaPipeLivenessService()
            result = detector.verify_liveness(image_path, method)
            threshold = cls.get_min_confidence_threshold()

            check_status = 'Verified' if (result.is_live and result.confidence >= threshold) else 'Failed'

            details   = result.details or {}
            eyes_data = details.get('eyes', {})
            head_pose = details.get('head_pose', {})

            relative_path = image_path
            if settings.MEDIA_ROOT and image_path.startswith(settings.MEDIA_ROOT):
                relative_path = image_path[len(settings.MEDIA_ROOT):].lstrip('/\\')

            LivenessCheck.objects.filter(loan_application=application).delete()

            liveness_check = LivenessCheck.objects.create(
                loan_application=application,
                method=method,
                confidence_score=Decimal(str(round(result.confidence, 2))),
                check_status=check_status,
                verified_at=timezone.now() if check_status == 'Verified' else None,
                left_ear=Decimal(str(round(eyes_data.get('left_ear', 0), 4))) if eyes_data.get('left_ear') else None,
                right_ear=Decimal(str(round(eyes_data.get('right_ear', 0), 4))) if eyes_data.get('right_ear') else None,
                avg_ear=Decimal(str(round(eyes_data.get('avg_ear', 0), 4))) if eyes_data.get('avg_ear') else None,
                eyes_open=eyes_data.get('eyes_open'),
                head_yaw=Decimal(str(round(head_pose.get('yaw', 0), 2))) if head_pose.get('yaw') else None,
                head_pitch=Decimal(str(round(head_pose.get('pitch', 0), 2))) if head_pose.get('pitch') else None,
                head_roll=Decimal(str(round(head_pose.get('roll', 0), 2))) if head_pose.get('roll') else None,
                image_path=relative_path,
                error_message=result.error_message,
                detection_details=json.dumps(details, cls=_SafeEncoder) if details else None,
            )

            from loans.models import AuditLog
            if check_status == 'Verified':
                AuditLog.objects.create(
                    user=application.user,
                    action=f"Liveness check successful for application #{application.id}",
                    action_type='LIVENESS_SUCCESS', severity='INFO', success=True,
                    related_application=application
                )
            else:
                AuditLog.objects.create(
                    user=application.user,
                    action=f"Liveness check failed for application #{application.id}",
                    action_type='LIVENESS_FAIL', severity='WARNING', success=False,
                    failure_reason=result.error_message or f"Confidence {result.confidence:.1f}% below threshold {threshold}%",
                    related_application=application
                )
                from applicant.security_alerts import SecurityAlertService
                SecurityAlertService.check_and_alert_repeated_failures(
                    user=application.user, application=application,
                    failure_type='LIVENESS_FAIL'
                )

            return {
                'success': result.is_live and check_status == 'Verified',
                'is_live': result.is_live,
                'confidence': result.confidence,
                'check_status': check_status,
                'method': method,
                'details': result.details,
                'error_message': result.error_message,
                'liveness_check_id': liveness_check.id,
                'threshold': threshold,
            }

        except LoanApplication.DoesNotExist:
            return {
                'success': False, 'is_live': False, 'confidence': 0.0,
                'check_status': 'Failed',
                'error_message': f"Application {application_id} not found"
            }
        except Exception as e:
            logger.error(f"Error in verify_liveness_for_application: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                'success': False, 'is_live': False, 'confidence': 0.0,
                'check_status': 'Failed',
                'error_message': f"Error during liveness verification: {str(e)}"
            }

    @classmethod
    def verify_with_face_comparison(
        cls, application_id: int, selfie_path: str, method: str = 'combined'
    ) -> Dict:
        from .face_verification_service import FaceComparisonService

        liveness_result = cls.verify_liveness_for_application(application_id, selfie_path, method)

        if not liveness_result.get('is_live', False):
            return {
                'success': False, 'liveness': liveness_result,
                'face_comparison': None, 'overall_verified': False,
                'error_message': liveness_result.get('error_message', 'Liveness check failed')
            }

        try:
            from loans.models import FaceVerification, LoanApplication
            application = LoanApplication.objects.get(id=application_id)
            FaceVerification.objects.filter(loan_application=application).delete()
            FaceVerification.objects.create(
                loan_application=application,
                captured_image_path=selfie_path.replace('\\', '/')
            )

            verification = FaceComparisonService.verify_faces_for_application(application_id)
            face_result = {
                'success': verification.verification_status in ('Verified', 'Needs Review'),
                'similarity_score': float(verification.similarity_score) if verification.similarity_score else 0,
                'is_match': verification.is_match,
                'verification_status': verification.verification_status,
                'error_message': verification.error_message,
            }

            overall_verified = (
                liveness_result.get('is_live', False) and
                liveness_result.get('check_status') == 'Verified' and
                face_result.get('is_match', False)
            )

            return {
                'success': overall_verified,
                'liveness': liveness_result,
                'face_comparison': face_result,
                'overall_verified': overall_verified,
                'error_message': None if overall_verified else (
                    face_result.get('error_message') or
                    liveness_result.get('error_message') or
                    'Verification failed'
                )
            }

        except Exception as e:
            logger.error(f"Error in face comparison: {str(e)}")
            return {
                'success': False, 'liveness': liveness_result,
                'face_comparison': {'error_message': str(e)},
                'overall_verified': False,
                'error_message': f"Face comparison error: {str(e)}"
            }
