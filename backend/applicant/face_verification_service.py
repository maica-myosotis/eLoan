"""
Face Verification Service
Handles face detection and comparison using OpenCV and DeepFace
"""

import os
import tempfile
import cv2
import logging
from decimal import Decimal
from django.conf import settings
from django.utils import timezone
from deepface import DeepFace
from PIL import Image
import numpy as np

from loans.models import FaceVerification, LoanApplication, LoanDocument

logger = logging.getLogger('face_verification')


class FaceComparisonService:
    """
    Service for face detection and comparison using OpenCV Haar Cascades and DeepFace.

    Dependencies:
    - opencv-python (cv2)
    - deepface
    - tf-keras (TensorFlow backend)
    """

    # Haar Cascade for face detection
    FACE_CASCADE_PATH = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'

    # DeepFace configuration
    MODEL_NAME = 'ArcFace'  # Options: VGG-Face, Facenet, OpenFace, DeepFace, DeepID, ArcFace, Dlib, SFace
    DISTANCE_METRIC = 'cosine'  # Options: cosine, euclidean, euclidean_l2
    DETECTOR_BACKEND = 'opencv'  # Options: opencv, ssd, dlib, mtcnn, retinaface

    # Thresholds from DeepFace documentation
    SIMILARITY_THRESHOLDS = {
        'ArcFace': {'cosine': 0.68, 'euclidean': 4.15, 'euclidean_l2': 1.13},
        'Facenet': {'cosine': 0.40, 'euclidean': 10, 'euclidean_l2': 0.80},
        'VGG-Face': {'cosine': 0.40, 'euclidean': 0.60, 'euclidean_l2': 0.86},
    }

    @classmethod
    def get_threshold(cls):
        """Get threshold for current model and distance metric"""
        return cls.SIMILARITY_THRESHOLDS.get(cls.MODEL_NAME, {}).get(cls.DISTANCE_METRIC, 0.68)

    @classmethod
    def _decrypt_to_temp(cls, encrypted_path):
        """
        Decrypt an encrypted file to a temporary file for processing.

        Args:
            encrypted_path (str): Path to the encrypted file

        Returns:
            tuple: (temp_path, error_message) — temp_path is None on failure.
                   Caller is responsible for deleting the temp file when done.
        """
        from .encryption_utils import FileEncryptionService

        logger.info(f"Attempting to decrypt file to temp: {encrypted_path}")
        success, data, error = FileEncryptionService.decrypt_file(encrypted_path)

        if not success:
            logger.warning(f"Decryption returned failure for {encrypted_path}: {error}")
            return None, error

        # Preserve the original extension so OpenCV/Pillow can identify the format
        ext = os.path.splitext(encrypted_path)[1] or '.jpg'
        tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
        try:
            tmp.write(data)
            tmp.flush()
            tmp.close()
            logger.info(f"Decrypted {encrypted_path} to temp file: {tmp.name} ({len(data)} bytes)")
            return tmp.name, None
        except Exception as e:
            tmp.close()
            os.unlink(tmp.name)
            logger.error(f"Failed to write decrypted data to temp file: {e}")
            return None, str(e)

    @classmethod
    def _load_image(cls, image_path):
        """
        Load image with OpenCV, falling back to Pillow for unsupported formats.

        Args:
            image_path (str): Path to image file

        Returns:
            tuple: (image_array, error_message) - image_array is None if loading failed
        """
        # Try OpenCV first
        image = cv2.imread(image_path)
        if image is not None:
            return image, None

        logger.warning(f"cv2.imread returned None for: {image_path}, trying Pillow fallback")

        # Try Pillow as fallback (handles HEIC, WebP, and other formats)
        try:
            pil_image = Image.open(image_path)
            logger.info(f"Pillow opened image: format={pil_image.format}, mode={pil_image.mode}, size={pil_image.size}")

            # Convert to RGB if necessary (handles RGBA, P, L, CMYK modes)
            if pil_image.mode != 'RGB':
                pil_image = pil_image.convert('RGB')

            # Convert PIL Image to numpy array for OpenCV
            image = np.array(pil_image)
            # Convert RGB to BGR (OpenCV uses BGR)
            image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
            logger.info(f"Successfully loaded image via Pillow fallback, shape: {image.shape}")
            return image, None
        except Exception as pil_error:
            logger.error(f"Pillow fallback also failed: {str(pil_error)}")
            return None, f'Could not load image. OpenCV and Pillow both failed: {str(pil_error)}'

    @classmethod
    def detect_face(cls, image_path):
        """
        Detect face in image using Haar Cascade.

        Args:
            image_path (str): Path to image file

        Returns:
            dict: {
                'success': bool,
                'face_count': int,
                'face_region': (x, y, w, h) or None,
                'message': str
            }
        """
        try:
            logger.info(f"Detecting face in: {image_path}")

            # Debug: Check if file exists and get details
            if not os.path.exists(image_path):
                logger.error(f"Image file does not exist: {image_path}")
                return {'success': False, 'face_count': 0, 'face_region': None,
                       'message': f'Image file not found: {image_path}'}

            file_size = os.path.getsize(image_path)
            logger.info(f"Image file exists, size: {file_size} bytes")

            if file_size == 0:
                logger.error(f"Image file is empty: {image_path}")
                return {'success': False, 'face_count': 0, 'face_region': None,
                       'message': 'Image file is empty (0 bytes)'}

            # Load image using helper method (with Pillow fallback)
            image, load_error = cls._load_image(image_path)
            if image is None:
                return {'success': False, 'face_count': 0, 'face_region': None,
                       'message': load_error or 'Could not load image'}

            # Convert to grayscale for face detection
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

            # Load Haar Cascade classifier
            face_cascade = cv2.CascadeClassifier(cls.FACE_CASCADE_PATH)

            # Detect faces
            faces = face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(30, 30)
            )

            face_count = len(faces)
            logger.info(f"Detected {face_count} face(s)")

            if face_count == 0:
                return {'success': False, 'face_count': 0, 'face_region': None,
                       'message': 'No face detected in image'}

            # If multiple faces, use the largest one
            if face_count > 1:
                logger.warning(f"Multiple faces detected ({face_count}). Using largest face.")
                faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)

            face_region = tuple(faces[0])  # (x, y, w, h)

            return {
                'success': True,
                'face_count': face_count,
                'face_region': face_region,
                'message': 'Face detected successfully'
            }

        except Exception as e:
            logger.error(f"Error detecting face: {str(e)}")
            return {'success': False, 'face_count': 0, 'face_region': None,
                   'message': f'Error: {str(e)}'}

    @classmethod
    def extract_face_from_document(cls, document_path, output_dir):
        """
        Extract face from ID document image and save cropped version.

        Args:
            document_path (str): Path to ID document image
            output_dir (str): Directory to save cropped face

        Returns:
            dict: {
                'success': bool,
                'face_path': str or None,
                'coordinates': dict or None,
                'message': str
            }
        """
        try:
            logger.info(f"Extracting face from document: {document_path}")

            # Detect face
            detection_result = cls.detect_face(document_path)
            if not detection_result['success']:
                return {
                    'success': False,
                    'face_path': None,
                    'coordinates': None,
                    'message': detection_result['message']
                }

            # Load image using helper method (with Pillow fallback)
            image, load_error = cls._load_image(document_path)
            if image is None:
                return {
                    'success': False,
                    'face_path': None,
                    'coordinates': None,
                    'message': load_error or 'Could not load image for face extraction'
                }
            x, y, w, h = detection_result['face_region']

            # Add padding around face (20%)
            padding = int(max(w, h) * 0.2)
            x1 = max(0, x - padding)
            y1 = max(0, y - padding)
            x2 = min(image.shape[1], x + w + padding)
            y2 = min(image.shape[0], y + h + padding)

            # Crop face with padding
            face_crop = image[y1:y2, x1:x2]

            # Create output directory if it doesn't exist
            os.makedirs(output_dir, exist_ok=True)

            # Save cropped face
            output_filename = 'id_face.jpg'
            output_path = os.path.join(output_dir, output_filename)
            cv2.imwrite(output_path, face_crop)

            logger.info(f"Face extracted and saved to: {output_path}")

            return {
                'success': True,
                'face_path': output_path,
                'coordinates': {'x': x, 'y': y, 'width': w, 'height': h},
                'message': 'Face extracted successfully'
            }

        except Exception as e:
            logger.error(f"Error extracting face from document: {str(e)}")
            return {
                'success': False,
                'face_path': None,
                'coordinates': None,
                'message': f'Error: {str(e)}'
            }

    @classmethod
    def compare_faces(cls, id_photo_path, selfie_path):
        """
        Compare two face images using DeepFace.

        Args:
            id_photo_path (str): Path to ID photo (or extracted face from ID)
            selfie_path (str): Path to selfie

        Returns:
            dict: {
                'success': bool,
                'verified': bool,
                'distance': float,
                'threshold': float,
                'similarity_percentage': float,
                'model': str,
                'distance_metric': str,
                'message': str
            }
        """
        try:
            logger.info(f"Comparing faces: ID={id_photo_path}, Selfie={selfie_path}")

            # Verify both images exist
            if not os.path.exists(id_photo_path):
                return {'success': False, 'verified': False, 'message': 'ID photo not found'}
            if not os.path.exists(selfie_path):
                return {'success': False, 'verified': False, 'message': 'Selfie not found'}

            # Perform face verification using DeepFace
            result = DeepFace.verify(
                img1_path=id_photo_path,
                img2_path=selfie_path,
                model_name=cls.MODEL_NAME,
                distance_metric=cls.DISTANCE_METRIC,
                detector_backend=cls.DETECTOR_BACKEND,
                enforce_detection=True
            )

            # Extract results
            distance = result.get('distance', 0)
            threshold = result.get('threshold', cls.get_threshold())
            verified = result.get('verified', False)

            # Convert distance to confidence percentage using piecewise linear mapping:
            #   distance <= 0.60  →  85–100%  (auto-approve zone)
            #   distance 0.60–0.75 →  60–85%  (manual review zone)
            #   distance > 0.75   →   0–60%   (reject zone)
            if cls.DISTANCE_METRIC == 'cosine':
                if distance <= 0.60:
                    similarity_percentage = 100 - (distance / 0.60) * 15
                elif distance <= 0.75:
                    similarity_percentage = 85 - ((distance - 0.60) / 0.15) * 25
                else:
                    similarity_percentage = max(0.0, 60 - ((distance - 0.75) / 0.25) * 60)
            else:
                # For other metrics, use threshold-based calculation
                similarity_percentage = max(0, min(100, (1 - (distance / threshold)) * 100))

            logger.info(f"Comparison result: verified={verified}, distance={distance}, "
                       f"threshold={threshold}, similarity={similarity_percentage}%")

            return {
                'success': True,
                'verified': verified,
                'distance': float(distance),
                'threshold': float(threshold),
                'similarity_percentage': float(similarity_percentage),
                'model': cls.MODEL_NAME,
                'distance_metric': cls.DISTANCE_METRIC,
                'message': 'Face comparison completed successfully'
            }

        except ValueError as e:
            # DeepFace raises ValueError when no face is detected
            logger.error(f"Face detection error in DeepFace: {str(e)}")
            return {
                'success': False,
                'verified': False,
                'distance': None,
                'threshold': None,
                'similarity_percentage': 0.0,
                'model': cls.MODEL_NAME,
                'distance_metric': cls.DISTANCE_METRIC,
                'message': f'Face detection failed: {str(e)}'
            }
        except Exception as e:
            logger.error(f"Error comparing faces: {str(e)}")
            return {
                'success': False,
                'verified': False,
                'distance': None,
                'threshold': None,
                'similarity_percentage': 0.0,
                'model': cls.MODEL_NAME,
                'distance_metric': cls.DISTANCE_METRIC,
                'message': f'Error: {str(e)}'
            }

    @classmethod
    def verify_faces_for_application(cls, application_id, captured_image_path=None):
        """
        Main method: Extract faces from ID and selfie, compare them, save results.

        Args:
            application_id (int): LoanApplication ID
            captured_image_path (str): Path to the captured selfie image

        Returns:
            FaceVerification: Updated FaceVerification object
        """
        try:
            logger.info(f"Starting face verification for application {application_id}")
            logger.info(f"Received captured_image_path parameter: {captured_image_path}")

            # Get application
            application = LoanApplication.objects.get(id=application_id)

            # Delete any existing FaceVerification records to start fresh
            # This prevents "MultipleObjectsReturned" errors on retry
            FaceVerification.objects.filter(loan_application=application).delete()

            # Create new FaceVerification record with captured image path
            face_verification = FaceVerification.objects.create(
                loan_application=application,
                captured_image_path=captured_image_path,
                verification_status='Processing'
            )

            # Get ID document (buksu_id)
            try:
                id_document = LoanDocument.objects.filter(
                    loan_application=application,
                    document_type='buksu_id'
                ).latest('uploaded_at')
                logger.info(f"Found buksu_id document: id={id_document.id}, file_path={id_document.file_path}")
                id_document_path = os.path.join(settings.MEDIA_ROOT, id_document.file_path)
            except LoanDocument.DoesNotExist:
                face_verification.error_message = "BukSu ID not found. Please upload your BukSu ID first."
                face_verification.verification_status = 'Failed'
                face_verification.processed_at = timezone.now()
                face_verification.save()
                logger.error(f"No buksu_id document found for application {application_id}")

                # Audit log: Missing BukSu ID
                from loans.models import AuditLog
                AuditLog.objects.create(
                    user=application.user,
                    action=f"Face verification failed for application #{application.id}: Missing BukSu ID",
                    action_type='FACE_VERIFY_FAIL',
                    severity='WARNING',
                    success=False,
                    failure_reason="BukSu ID document not uploaded",
                    related_application=application
                )

                # Check for repeated failures and alert
                from .security_alerts import SecurityAlertService
                SecurityAlertService.check_and_alert_repeated_failures(
                    user=application.user,
                    application=application,
                    failure_type='FACE_VERIFY_FAIL'
                )

                return face_verification

            # Get selfie path
            if not face_verification.captured_image_path:
                face_verification.error_message = "Selfie not found. Please capture your selfie."
                face_verification.verification_status = 'Failed'
                face_verification.processed_at = timezone.now()
                face_verification.save()
                logger.error(f"No selfie found for application {application_id}")

                # Audit log: Missing selfie
                from loans.models import AuditLog
                AuditLog.objects.create(
                    user=application.user,
                    action=f"Face verification failed for application #{application.id}: Missing selfie",
                    action_type='FACE_VERIFY_FAIL',
                    severity='WARNING',
                    success=False,
                    failure_reason="Selfie image not captured",
                    related_application=application
                )

                # Check for repeated failures and alert
                from .security_alerts import SecurityAlertService
                SecurityAlertService.check_and_alert_repeated_failures(
                    user=application.user,
                    application=application,
                    failure_type='FACE_VERIFY_FAIL'
                )

                return face_verification

            selfie_path = os.path.join(settings.MEDIA_ROOT, face_verification.captured_image_path)

            # Debug: Log all paths being used
            logger.info("=" * 50)
            logger.info(f"FACE VERIFICATION DEBUG for Application {application_id}")
            logger.info(f"MEDIA_ROOT: {settings.MEDIA_ROOT}")
            logger.info(f"ID document file_path (from DB): {id_document.file_path}")
            logger.info(f"ID document full path: {id_document_path}")
            logger.info(f"ID document exists: {os.path.exists(id_document_path)}")
            if os.path.exists(id_document_path):
                logger.info(f"ID document size: {os.path.getsize(id_document_path)} bytes")
            logger.info(f"Selfie captured_image_path (from DB): {face_verification.captured_image_path}")
            logger.info(f"Selfie full path: {selfie_path}")
            logger.info(f"Selfie exists: {os.path.exists(selfie_path)}")
            if os.path.exists(selfie_path):
                logger.info(f"Selfie size: {os.path.getsize(selfie_path)} bytes")
            logger.info("=" * 50)

            # Create faces directory for extracted faces
            faces_dir = os.path.join(settings.MEDIA_ROOT, f'applicant/faces/{application_id}')

            # Decrypt the ID document to a temp file if it is encrypted.
            # Documents are encrypted at rest immediately after upload, so the
            # file on disk is Fernet-encrypted and cannot be read by OpenCV/Pillow.
            temp_id_path = None
            id_path_for_processing = id_document_path

            logger.info(f"Checking if ID document is encrypted: {id_document_path}")
            temp_id_path, decrypt_error = cls._decrypt_to_temp(id_document_path)
            if temp_id_path:
                logger.info(f"Using decrypted temp file for face processing: {temp_id_path}")
                id_path_for_processing = temp_id_path
            else:
                # File was not encrypted (or decryption key mismatch) — try using original
                logger.warning(f"Could not decrypt ID document ({decrypt_error}), attempting to use original path directly")
                id_path_for_processing = id_document_path

            try:
                # Step 1: Extract face from ID document
                logger.info("Extracting face from ID document...")
                id_face_result = cls.extract_face_from_document(id_path_for_processing, faces_dir)

                if not id_face_result['success']:
                    face_verification.error_message = id_face_result['message']
                    face_verification.face_detected_in_id = False
                    face_verification.verification_status = 'Failed'
                    face_verification.processed_at = timezone.now()
                    face_verification.save()
                    logger.error(f"Failed to extract face from ID: {id_face_result['message']}")

                    # Audit log: Failed to extract face from ID
                    from loans.models import AuditLog
                    AuditLog.objects.create(
                        user=application.user,
                        action=f"Face verification failed for application #{application.id}: Cannot extract face from ID",
                        action_type='FACE_VERIFY_FAIL',
                        severity='WARNING',
                        success=False,
                        failure_reason=id_face_result['message'],
                        related_application=application
                    )

                    # Check for repeated failures and alert
                    from .security_alerts import SecurityAlertService
                    SecurityAlertService.check_and_alert_repeated_failures(
                        user=application.user,
                        application=application,
                        failure_type='FACE_VERIFY_FAIL'
                    )

                    return face_verification

                face_verification.face_detected_in_id = True
                # Store relative path from MEDIA_ROOT
                id_face_relative_path = os.path.relpath(id_face_result['face_path'], settings.MEDIA_ROOT)
                face_verification.id_photo_path = id_face_relative_path

                # Step 2: Detect face in selfie
                logger.info("Detecting face in selfie...")
                selfie_detection = cls.detect_face(selfie_path)

                if not selfie_detection['success']:
                    face_verification.error_message = f"Selfie: {selfie_detection['message']}"
                    face_verification.face_detected_in_selfie = False
                    face_verification.verification_status = 'Failed'
                    face_verification.processed_at = timezone.now()
                    face_verification.save()
                    logger.error(f"No face detected in selfie: {selfie_detection['message']}")

                    # Audit log: No face detected in selfie
                    from loans.models import AuditLog
                    AuditLog.objects.create(
                        user=application.user,
                        action=f"Face verification failed for application #{application.id}: No face detected in selfie",
                        action_type='FACE_VERIFY_FAIL',
                        severity='WARNING',
                        success=False,
                        failure_reason=selfie_detection['message'],
                        related_application=application
                    )

                    # Check for repeated failures and alert
                    from .security_alerts import SecurityAlertService
                    SecurityAlertService.check_and_alert_repeated_failures(
                        user=application.user,
                        application=application,
                        failure_type='FACE_VERIFY_FAIL'
                    )

                    return face_verification

                face_verification.face_detected_in_selfie = True

                # Step 3: Compare faces using DeepFace
                logger.info("Comparing faces with DeepFace...")
                comparison_result = cls.compare_faces(id_face_result['face_path'], selfie_path)

                if not comparison_result['success']:
                    face_verification.error_message = comparison_result['message']
                    face_verification.verification_status = 'Failed'
                    face_verification.processed_at = timezone.now()
                    face_verification.save()
                    logger.error(f"Face comparison failed: {comparison_result['message']}")

                    # Audit log: Face comparison failed
                    from loans.models import AuditLog
                    AuditLog.objects.create(
                        user=application.user,
                        action=f"Face verification failed for application #{application.id}: Comparison error",
                        action_type='FACE_VERIFY_FAIL',
                        severity='WARNING',
                        success=False,
                        failure_reason=comparison_result['message'],
                        related_application=application
                    )

                    # Check for repeated failures and alert
                    from .security_alerts import SecurityAlertService
                    SecurityAlertService.check_and_alert_repeated_failures(
                        user=application.user,
                        application=application,
                        failure_type='FACE_VERIFY_FAIL'
                    )

                    return face_verification

                # Store comparison results
                face_verification.similarity_score = Decimal(str(comparison_result['similarity_percentage']))
                face_verification.comparison_model = comparison_result['model']
                face_verification.comparison_distance = Decimal(str(comparison_result['distance'])) if comparison_result['distance'] is not None else None
                face_verification.comparison_threshold = Decimal(str(comparison_result['threshold'])) if comparison_result['threshold'] is not None else None

                # Determine verification outcome using tiered distance thresholds
                face_config = getattr(settings, 'FACE_VERIFICATION', {})
                auto_approve_max_distance = face_config.get('AUTO_APPROVE_MAX_DISTANCE', 0.60)
                review_max_distance = face_config.get('REVIEW_MAX_DISTANCE', 0.75)
                distance = comparison_result['distance']
                similarity = comparison_result['similarity_percentage']

                if distance <= auto_approve_max_distance:
                    # Auto-approved: face matches ID clearly
                    face_verification.is_match = True
                    face_verification.verification_status = 'Verified'
                    face_verification.verified_at = timezone.now()
                    face_verification.error_message = None
                    logger.info(f"Face verification PASSED: distance={distance:.4f} (<= {auto_approve_max_distance}), similarity={similarity:.1f}%")

                    from loans.models import AuditLog
                    AuditLog.objects.create(
                        user=application.user,
                        action=f"Face verification successful for application #{application.id}",
                        action_type='FACE_VERIFY_SUCCESS',
                        severity='INFO',
                        success=True,
                        related_application=application
                    )

                elif distance <= review_max_distance:
                    # Borderline: allow to proceed but flag for bookkeeper review
                    face_verification.is_match = True
                    face_verification.verification_status = 'Needs Review'
                    face_verification.verified_at = timezone.now()
                    face_verification.error_message = None
                    logger.info(f"Face verification NEEDS REVIEW: distance={distance:.4f} ({auto_approve_max_distance}–{review_max_distance} range), similarity={similarity:.1f}%")

                    from loans.models import AuditLog
                    AuditLog.objects.create(
                        user=application.user,
                        action=f"Face verification flagged for review for application #{application.id}: distance={distance:.4f}",
                        action_type='FACE_VERIFY_REVIEW',
                        severity='WARNING',
                        success=True,
                        failure_reason=f"Distance {distance:.4f} is in manual review range ({auto_approve_max_distance}–{review_max_distance})",
                        related_application=application
                    )

                else:
                    # Above maximum — rejected
                    face_verification.is_match = False
                    face_verification.verification_status = 'Failed'
                    face_verification.error_message = (
                        f"Face verification failed. Distance score ({distance:.4f}) "
                        f"exceeds the maximum threshold ({review_max_distance})."
                    )
                    logger.warning(f"Face verification FAILED: distance={distance:.4f} (> {review_max_distance}), similarity={similarity:.1f}%")

                    from loans.models import AuditLog
                    AuditLog.objects.create(
                        user=application.user,
                        action=f"Face verification failed for application #{application.id}: Distance above threshold",
                        action_type='FACE_VERIFY_FAIL',
                        severity='WARNING',
                        success=False,
                        failure_reason=f"Distance {distance:.4f} exceeds maximum threshold {review_max_distance}",
                        related_application=application
                    )

                    from .security_alerts import SecurityAlertService
                    SecurityAlertService.check_and_alert_repeated_failures(
                        user=application.user,
                        application=application,
                        failure_type='FACE_VERIFY_FAIL'
                    )

                face_verification.processed_at = timezone.now()
                face_verification.save()

                return face_verification

            finally:
                # Always clean up the decrypted temp file
                if temp_id_path and os.path.exists(temp_id_path):
                    os.unlink(temp_id_path)
                    logger.info(f"Cleaned up temp decrypted ID file: {temp_id_path}")

        except LoanApplication.DoesNotExist:
            logger.error(f"LoanApplication {application_id} not found")
            raise
        except Exception as e:
            logger.error(f"Unexpected error in verify_faces_for_application: {str(e)}")
            # Try to update face verification record if it exists
            try:
                face_verification.error_message = f"System error: {str(e)}"
                face_verification.verification_status = 'Failed'
                face_verification.processed_at = timezone.now()
                face_verification.save()
            except:
                pass
            raise
