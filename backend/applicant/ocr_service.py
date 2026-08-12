"""
ID OCR Service

Provides OCR scanning for Philippine government IDs:
- Philippine National ID (PhilID/PhilSys)
- Driver's License
- UMID (Unified Multi-Purpose ID)
- Passport

Uses Tesseract OCR for text extraction and regex patterns for field parsing.
"""

import re
import logging
from datetime import datetime
from typing import Dict, Optional, Tuple
from difflib import SequenceMatcher
from django.conf import settings

try:
    import pytesseract
    if getattr(settings, 'TESSERACT_CMD', ''):
        pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD
    from PIL import Image, ImageEnhance, ImageFilter
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

logger = logging.getLogger(__name__)


class IDType:
    """ID type constants."""
    DRIVERS_LICENSE = 'drivers_license'
    UMID = 'umid'
    PASSPORT = 'passport'
    PHILIPPINE_ID = 'philippine_id'
    UNKNOWN = 'unknown'


class IDOCRService:
    """
    Service for processing Philippine government IDs using OCR.

    Supported IDs:
    - Philippine National ID (PhilID/PhilSys - PSA)
    - Driver's License (LTO)
    - UMID (SSS, GSIS, PhilHealth, Pag-IBIG)
    - Passport
    """

    # ID type detection patterns
    ID_TYPE_PATTERNS = {
        IDType.DRIVERS_LICENSE: [
            r"DRIVER'?S?\s*LICENSE",
            r"LAND\s*TRANSPORTATION\s*OFFICE",
            r"\bLTO\b",
            r"RESTRICTION",
            r"NON.?PROFESSIONAL",
            r"PROFESSIONAL",
            r"LICENSE\s*NO",
            r"DL\s*NO",
        ],
        IDType.UMID: [
            r"\bUMID\b",
            r"UNIFIED\s*MULTI.?PURPOSE",
            r"\bSSS\b",
            r"\bGSIS\b",
            r"PHILHEALTH",
            r"PAG.?IBIG",
            r"CRN\s*:?\s*\d",
        ],
        IDType.PASSPORT: [
            r"\bPASSPORT\b",
            r"REPUBLIKA\s*NG\s*PILIPINAS",
            r"REPUBLIC\s*OF\s*THE\s*PHILIPPINES",
            r"DEPARTMENT\s*OF\s*FOREIGN\s*AFFAIRS",
            r"\bDFA\b",
            r"TYPE\s*P",
            r"PASSPORT\s*NO",
        ],
        IDType.PHILIPPINE_ID: [
            r"PHILIPPINE\s*IDENTIFICATION",
            r"PHILIPPINE\s*NATIONAL\s*ID",
            r"\bPHILID\b",
            r"\bPHILSYS\b",
            r"PHILIPPINE\s*STATISTICS\s*AUTHORITY",
            r"\bPSA\b",
            r"PCN\s*:?\s*\d",
            r"PSN\s*:?\s*\d",
        ],
    }

    # Field extraction patterns per ID type
    FIELD_PATTERNS = {
        IDType.DRIVERS_LICENSE: {
            'id_number': [
                r"(?:LICENSE\s*NO|DL\s*NO|NO)[\s.:]*([A-Z]\d{2}[-\s]?\d{2}[-\s]?\d{6,7})",
                r"([A-Z]\d{2}[-\s]?\d{2}[-\s]?\d{6,7})",
            ],
            'full_name': [
                r"(?:NAME|LAST\s*NAME|SURNAME)[\s.:]*([A-Z][A-Z\s,.-]+)",
                r"(?:FIRST\s*NAME|GIVEN\s*NAME)[\s.:]*([A-Z][A-Z\s.-]+)",
            ],
            'birthdate': [
                r"(?:DATE\s*OF\s*BIRTH|BIRTH\s*DATE|DOB|BIRTHDAY)[\s.:]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
                r"(?:DATE\s*OF\s*BIRTH|DOB)[\s.:]*([A-Z]{3,9}\s*\d{1,2},?\s*\d{4})",
            ],
            'address': [
                r"(?:ADDRESS|RESIDENCE)[\s.:]*([A-Z0-9][A-Z0-9\s,.-]+(?:CITY|PROVINCE|MANILA|QUEZON|CEBU|DAVAO)[A-Z\s]*)",
            ],
        },
        IDType.UMID: {
            'id_number': [
                r"(?:CRN|ID\s*NO|UMID\s*NO)[\s.:]*(\d{2}[-\s]?\d{7}[-\s]?\d{1})",
                r"(\d{2}[-\s]?\d{7}[-\s]?\d{1})",
            ],
            'full_name': [
                r"(?:NAME|LAST\s*NAME|SURNAME)[\s.:]*([A-Z][A-Z\s,.-]+)",
            ],
            'birthdate': [
                r"(?:DATE\s*OF\s*BIRTH|BIRTH\s*DATE|DOB)[\s.:]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
                r"(?:DOB)[\s.:]*([A-Z]{3,9}\s*\d{1,2},?\s*\d{4})",
            ],
            'address': [
                r"(?:ADDRESS)[\s.:]*([A-Z0-9][A-Z0-9\s,.-]+)",
            ],
        },
        IDType.PASSPORT: {
            'id_number': [
                r"(?:PASSPORT\s*NO|NO)[\s.:]*([A-Z]{1,2}\d{7,8}[A-Z]?)",
                r"([A-Z]{1,2}\d{7,8}[A-Z]?)",
            ],
            'full_name': [
                r"(?:SURNAME|LAST\s*NAME)[\s/.:]*([A-Z][A-Z\s-]+)",
                r"(?:GIVEN\s*NAME|FIRST\s*NAME)[\s/.:]*([A-Z][A-Z\s-]+)",
            ],
            'birthdate': [
                r"(?:DATE\s*OF\s*BIRTH|BIRTH)[\s.:]*(\d{1,2}\s*[A-Z]{3}\s*\d{4})",
                r"(?:DOB)[\s.:]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
            ],
            'address': [],  # Passports typically don't have address
        },
        IDType.PHILIPPINE_ID: {
            'id_number': [
                r"(?:PCN|PSN|PHILSYS\s*NO|ID\s*NO)[\s.:]*(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})",
                r"(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})",
            ],
            'full_name': [
                r"(?:SURNAME|LAST\s*NAME|APELYIDO)[\s.:]*([A-Z][A-Z\s,.-]+)",
                r"(?:GIVEN\s*NAME|FIRST\s*NAME|PANGALAN)[\s.:]*([A-Z][A-Z\s.-]+)",
            ],
            'birthdate': [
                r"(?:DATE\s*OF\s*BIRTH|BIRTH\s*DATE|DOB|KAPANGANAKAN)[\s.:]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
                r"(?:DATE\s*OF\s*BIRTH|DOB)[\s.:]*([A-Z]{3,9}\s*\d{1,2},?\s*\d{4})",
            ],
            'address': [
                r"(?:ADDRESS|TIRAHAN)[\s.:]*([A-Z0-9][A-Z0-9\s,.-]+(?:CITY|PROVINCE|MANILA|QUEZON|CEBU|DAVAO)[A-Z\s]*)",
            ],
        },
    }

    @classmethod
    def check_tesseract_available(cls) -> bool:
        """Check if Tesseract OCR is available."""
        if not TESSERACT_AVAILABLE:
            return False
        try:
            pytesseract.get_tesseract_version()
            return True
        except Exception:
            return False

    @classmethod
    def preprocess_image(cls, image_path: str) -> Image.Image:
        """
        Preprocess image for better OCR results.

        - Convert to grayscale
        - Enhance contrast
        - Apply sharpening
        - Denoise
        """
        img = Image.open(image_path)

        # Convert to RGB if necessary
        if img.mode != 'RGB':
            img = img.convert('RGB')

        # Convert to grayscale
        img = img.convert('L')

        # Enhance contrast
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.0)

        # Sharpen
        img = img.filter(ImageFilter.SHARPEN)

        # Resize if too small (improves OCR accuracy)
        width, height = img.size
        if width < 1000:
            ratio = 1000 / width
            new_size = (int(width * ratio), int(height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)

        return img

    @classmethod
    def extract_text(cls, image_path: str) -> str:
        """
        Extract text from image using Tesseract OCR.

        Args:
            image_path: Path to the image file

        Returns:
            Extracted text string
        """
        if not TESSERACT_AVAILABLE:
            raise RuntimeError("Tesseract OCR is not installed. Please install pytesseract and Pillow.")

        try:
            # Preprocess image
            img = cls.preprocess_image(image_path)

            # OCR configuration for better accuracy
            custom_config = r'--oem 3 --psm 6 -l eng'

            # Extract text
            text = pytesseract.image_to_string(img, config=custom_config)

            # Clean up text
            text = text.upper()
            text = re.sub(r'[^\w\s,./:-]', '', text)

            logger.debug(f"Extracted text: {text[:500]}...")
            return text

        except Exception as e:
            logger.error(f"OCR extraction failed: {str(e)}")
            raise

    @classmethod
    def detect_id_type(cls, text: str) -> Tuple[str, float]:
        """
        Detect the type of ID from extracted text.

        Args:
            text: OCR extracted text

        Returns:
            Tuple of (id_type, confidence_score)
        """
        scores = {}

        for id_type, patterns in cls.ID_TYPE_PATTERNS.items():
            matches = 0
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    matches += 1
            scores[id_type] = matches / len(patterns) if patterns else 0

        # Get the ID type with highest score
        best_type = max(scores, key=scores.get)
        best_score = scores[best_type]

        # If score is too low, return unknown
        if best_score < 0.1:
            return IDType.UNKNOWN, 0.0

        return best_type, min(best_score * 1.5, 1.0)  # Scale up but cap at 1.0

    @classmethod
    def extract_field(cls, text: str, patterns: list) -> Tuple[Optional[str], float]:
        """
        Extract a field value using multiple regex patterns.

        Args:
            text: OCR extracted text
            patterns: List of regex patterns to try

        Returns:
            Tuple of (extracted_value, confidence_score)
        """
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                value = match.group(1).strip()
                # Clean up the value
                value = re.sub(r'\s+', ' ', value)
                value = value.strip(' ,.-')
                if len(value) >= 2:
                    # Calculate confidence based on pattern specificity and match quality
                    confidence = 0.7 + (0.3 * (len(value) / 50))  # Longer matches = higher confidence
                    return value, min(confidence, 0.98)

        return None, 0.0

    @classmethod
    def extract_name_parts(cls, text: str, id_type: str) -> Tuple[str, float]:
        """
        Extract full name from text, combining surname and given name if needed.
        """
        patterns = cls.FIELD_PATTERNS.get(id_type, {}).get('full_name', [])

        surname = None
        given_name = None
        confidence = 0.0

        # Try to extract surname
        surname_patterns = [p for p in patterns if 'SURNAME' in p or 'LAST' in p]
        for pattern in surname_patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                surname = match.group(1).strip()
                break

        # Try to extract given name
        given_patterns = [p for p in patterns if 'GIVEN' in p or 'FIRST' in p]
        for pattern in given_patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                given_name = match.group(1).strip()
                break

        # Combine names
        if surname and given_name:
            full_name = f"{given_name} {surname}"
            confidence = 0.90
        elif surname:
            full_name = surname
            confidence = 0.75
        elif given_name:
            full_name = given_name
            confidence = 0.70
        else:
            # Fallback: try generic name pattern
            name_match = re.search(r"NAME[\s.:]*([A-Z][A-Z\s,.-]{5,50})", text, re.IGNORECASE)
            if name_match:
                full_name = name_match.group(1).strip()
                confidence = 0.60
            else:
                return None, 0.0

        # Clean up name
        full_name = re.sub(r'\s+', ' ', full_name)
        full_name = full_name.strip(' ,.-')

        return full_name, confidence

    @classmethod
    def normalize_date(cls, date_str: str) -> Optional[str]:
        """
        Normalize various date formats to YYYY-MM-DD.
        """
        if not date_str:
            return None

        date_str = date_str.strip()

        # Common date formats to try
        formats = [
            "%m/%d/%Y",
            "%d/%m/%Y",
            "%m-%d-%Y",
            "%d-%m-%Y",
            "%Y-%m-%d",
            "%B %d, %Y",
            "%b %d, %Y",
            "%d %B %Y",
            "%d %b %Y",
            "%B %d %Y",
            "%b %d %Y",
        ]

        for fmt in formats:
            try:
                parsed = datetime.strptime(date_str, fmt)
                return parsed.strftime("%Y-%m-%d")
            except ValueError:
                continue

        return date_str  # Return original if can't parse

    @classmethod
    def extract_fields(cls, text: str, id_type: str) -> Dict:
        """
        Extract all fields from OCR text based on ID type.

        Args:
            text: OCR extracted text
            id_type: Detected ID type

        Returns:
            Dictionary with extracted fields and confidence scores
        """
        patterns = cls.FIELD_PATTERNS.get(id_type, cls.FIELD_PATTERNS[IDType.DRIVERS_LICENSE])

        # Extract ID number
        id_number, id_confidence = cls.extract_field(text, patterns.get('id_number', []))

        # Extract name
        full_name, name_confidence = cls.extract_name_parts(text, id_type)

        # Extract birthdate
        birthdate, dob_confidence = cls.extract_field(text, patterns.get('birthdate', []))
        if birthdate:
            birthdate = cls.normalize_date(birthdate)

        # Extract address
        address, addr_confidence = cls.extract_field(text, patterns.get('address', []))

        return {
            'extracted_data': {
                'full_name': full_name,
                'id_number': id_number,
                'birthdate': birthdate,
                'address': address,
            },
            'confidence_scores': {
                'full_name': round(name_confidence, 2),
                'id_number': round(id_confidence, 2),
                'birthdate': round(dob_confidence, 2),
                'address': round(addr_confidence, 2),
            }
        }

    @classmethod
    def calculate_overall_confidence(cls, confidence_scores: Dict) -> float:
        """
        Calculate overall confidence score from individual field scores.

        Weights:
        - ID number: 30%
        - Full name: 40%
        - Birthdate: 20%
        - Address: 10%
        """
        weights = {
            'id_number': 0.30,
            'full_name': 0.40,
            'birthdate': 0.20,
            'address': 0.10,
        }

        total_score = 0.0
        total_weight = 0.0

        for field, weight in weights.items():
            score = confidence_scores.get(field, 0.0)
            if score > 0:
                total_score += score * weight
                total_weight += weight

        if total_weight == 0:
            return 0.0

        return round(total_score / total_weight, 2)

    @classmethod
    def compare_names(cls, ocr_name: str, profile_name: str) -> Dict:
        """
        Compare OCR extracted name with profile name.

        Returns:
            Dictionary with match result and similarity score
        """
        if not ocr_name or not profile_name:
            return {
                'match': False,
                'similarity': 0.0,
                'ocr_name': ocr_name,
                'profile_name': profile_name,
            }

        # Normalize names for comparison
        ocr_normalized = ocr_name.upper().strip()
        profile_normalized = profile_name.upper().strip()

        # Remove common suffixes and titles
        suffixes = ['JR', 'SR', 'II', 'III', 'IV', 'V']
        for suffix in suffixes:
            ocr_normalized = re.sub(rf'\b{suffix}\b\.?', '', ocr_normalized)
            profile_normalized = re.sub(rf'\b{suffix}\b\.?', '', profile_normalized)

        # Clean up extra spaces
        ocr_normalized = ' '.join(ocr_normalized.split())
        profile_normalized = ' '.join(profile_normalized.split())

        # Calculate similarity
        similarity = SequenceMatcher(None, ocr_normalized, profile_normalized).ratio()

        # Consider it a match if similarity >= 85%
        is_match = similarity >= 0.85

        return {
            'match': is_match,
            'similarity': round(similarity, 2),
            'ocr_name': ocr_name,
            'profile_name': profile_name,
        }

    @classmethod
    def process_id_image(cls, image_path: str, profile_name: str = None) -> Dict:
        """
        Main method to process an ID image and extract all information.

        Args:
            image_path: Path to the ID image file
            profile_name: User's profile name for validation (optional)

        Returns:
            Dictionary with all extracted data, confidence scores, and validation results
        """
        if not cls.check_tesseract_available():
            return {
                'success': False,
                'error': 'Tesseract OCR is not available. Please install Tesseract.',
                'id_type': IDType.UNKNOWN,
                'extracted_data': {},
                'confidence_scores': {},
                'overall_confidence': 0.0,
            }

        try:
            # Extract text from image
            text = cls.extract_text(image_path)

            if not text or len(text.strip()) < 20:
                return {
                    'success': False,
                    'error': 'Could not extract text from image. Please ensure the image is clear and well-lit.',
                    'id_type': IDType.UNKNOWN,
                    'extracted_data': {},
                    'confidence_scores': {},
                    'overall_confidence': 0.0,
                }

            # Detect ID type
            id_type, type_confidence = cls.detect_id_type(text)

            # Extract fields
            result = cls.extract_fields(text, id_type)

            # Calculate overall confidence
            overall_confidence = cls.calculate_overall_confidence(result['confidence_scores'])

            # Build response
            response = {
                'success': True,
                'id_type': id_type,
                'id_type_confidence': round(type_confidence, 2),
                'extracted_data': result['extracted_data'],
                'confidence_scores': result['confidence_scores'],
                'overall_confidence': overall_confidence,
                'raw_text_length': len(text),
            }

            # Add name validation if profile name provided
            if profile_name and result['extracted_data'].get('full_name'):
                response['name_validation'] = cls.compare_names(
                    result['extracted_data']['full_name'],
                    profile_name
                )

            return response

        except Exception as e:
            logger.exception(f"Error processing ID image: {str(e)}")
            return {
                'success': False,
                'error': f'Error processing image: {str(e)}',
                'id_type': IDType.UNKNOWN,
                'extracted_data': {},
                'confidence_scores': {},
                'overall_confidence': 0.0,
            }
