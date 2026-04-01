import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Modal,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import authService from '../services/authService';

// ─── Constants ───────────────────────────────────────────────────────────────
const CIVIL_STATUS_OPTIONS = [
  { label: 'Single', value: 'single' },
  { label: 'Married', value: 'married' },
  { label: 'Widowed', value: 'widowed' },
  { label: 'Separated', value: 'separated' },
];
const GENDER_OPTIONS = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
];
const EDUCATION_OPTIONS = [
  { label: 'Elementary', value: 'elementary' },
  { label: 'High School', value: 'high_school' },
  { label: 'Vocational/Technical', value: 'vocational' },
  { label: 'College', value: 'college' },
  { label: 'Post-Graduate', value: 'post_graduate' },
];
const EMP_CATEGORY_OPTIONS = [
  { label: 'Teaching', value: 'teaching' },
  { label: 'Non-Teaching', value: 'non_teaching' },
  { label: 'Others', value: 'others' },
];
const EMP_STATUS_OPTIONS = [
  { label: 'Regular', value: 'regular' },
  { label: 'Casual', value: 'casual' },
  { label: 'Job Order', value: 'job_order' },
  { label: 'Part-time', value: 'part_time' },
];
const STEP_TITLES = [
  'Personal Details',
  'Home Addresses',
  'Employment',
  'Family & Emergency',
  'Beneficiaries',
  'Documents',
];

// ─── Reusable Dropdown ───────────────────────────────────────────────────────
function Dropdown({ label, value, options, onChange, placeholder = 'Select...', disabled }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <View style={dd.wrapper}>
      {label ? <Text style={dd.label}>{label}</Text> : null}
      <TouchableOpacity
        style={[dd.btn, disabled && dd.btnDisabled]}
        onPress={() => !disabled && setOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={[dd.btnText, !selected && dd.placeholder]}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={dd.arrow}>▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={dd.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={dd.menu}>
            <Text style={dd.menuTitle}>{label || placeholder}</Text>
            {options.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[dd.item, opt.value === value && dd.itemActive]}
                onPress={() => { onChange(opt.value); setOpen(false); }}
              >
                <Text style={[dd.itemText, opt.value === value && dd.itemTextActive]}>
                  {opt.label}
                </Text>
                {opt.value === value && <Text style={dd.check}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Date Picker ─────────────────────────────────────────────────────────────
const MONTHS_LIST = [
  { label: 'January', value: '01' }, { label: 'February', value: '02' },
  { label: 'March', value: '03' },   { label: 'April', value: '04' },
  { label: 'May', value: '05' },     { label: 'June', value: '06' },
  { label: 'July', value: '07' },    { label: 'August', value: '08' },
  { label: 'September', value: '09' },{ label: 'October', value: '10' },
  { label: 'November', value: '11' }, { label: 'December', value: '12' },
];

function DatePickerField({ value, onChange }) {
  const [open, setOpen] = useState(false);

  const _cur = new Date().getFullYear();
  const YEARS = Array.from({ length: _cur - 18 - (_cur - 100) + 1 }, (_, i) => String(_cur - 100 + i));

  const getDaysInMonth = (y, m) => (!y || !m ? 31 : new Date(parseInt(y), parseInt(m), 0).getDate());

  const initParts = () => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-');
      return { y, m, d };
    }
    return { y: String(_cur - 25), m: '01', d: '01' };
  };

  const [selYear, setSelYear] = useState(() => initParts().y);
  const [selMonth, setSelMonth] = useState(() => initParts().m);
  const [selDay, setSelDay] = useState(() => initParts().d);

  const DAYS = Array.from(
    { length: getDaysInMonth(selYear, selMonth) },
    (_, i) => String(i + 1).padStart(2, '0'),
  );

  const confirm = () => {
    const maxDay = getDaysInMonth(selYear, selMonth);
    const safeDay = String(Math.min(parseInt(selDay, 10), maxDay)).padStart(2, '0');
    onChange(`${selYear}-${selMonth}-${safeDay}`);
    setSelDay(safeDay);
    setOpen(false);
  };

  const displayValue = (() => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split('-');
    const mon = MONTHS_LIST.find(mo => mo.value === m);
    return `${mon ? mon.label : m} ${parseInt(d, 10)}, ${y}`;
  })();

  return (
    <View>
      <TouchableOpacity style={dd.btn} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={[dd.btnText, !displayValue && dd.placeholder]}>
          {displayValue || 'Select date of birth'}
        </Text>
        <Text style={dd.arrow}>📅</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={dp.overlay}>
          <View style={dp.sheet}>
            <View style={dp.header}>
              <Text style={dp.title}>Date of Birth</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={dp.cancel}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <View style={dp.columns}>
              {/* Month */}
              <View style={dp.colWrap}>
                <Text style={dp.colLabel}>Month</Text>
                <ScrollView style={dp.col} showsVerticalScrollIndicator={false}>
                  {MONTHS_LIST.map(m => (
                    <TouchableOpacity
                      key={m.value}
                      style={[dp.item, selMonth === m.value && dp.itemSel]}
                      onPress={() => setSelMonth(m.value)}
                    >
                      <Text style={[dp.itemText, selMonth === m.value && dp.itemTextSel]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Day */}
              <View style={[dp.colWrap, { flex: 0, width: 72 }]}>
                <Text style={dp.colLabel}>Day</Text>
                <ScrollView style={dp.col} showsVerticalScrollIndicator={false}>
                  {DAYS.map(d => (
                    <TouchableOpacity
                      key={d}
                      style={[dp.item, selDay === d && dp.itemSel]}
                      onPress={() => setSelDay(d)}
                    >
                      <Text style={[dp.itemText, selDay === d && dp.itemTextSel]}>
                        {parseInt(d, 10)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Year */}
              <View style={[dp.colWrap, { flex: 0, width: 84 }]}>
                <Text style={dp.colLabel}>Year</Text>
                <ScrollView style={dp.col} showsVerticalScrollIndicator={false}>
                  {YEARS.map(y => (
                    <TouchableOpacity
                      key={y}
                      style={[dp.item, selYear === y && dp.itemSel]}
                      onPress={() => setSelYear(y)}
                    >
                      <Text style={[dp.itemText, selYear === y && dp.itemTextSel]}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <TouchableOpacity style={dp.confirmBtn} onPress={confirm}>
              <Text style={dp.confirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Field + Label helper ─────────────────────────────────────────────────────
function Field({ label, required, children }) {
  return (
    <View style={s.fieldWrap}>
      {label ? (
        <Text style={s.fieldLabel}>
          {label}{required ? <Text style={s.req}> *</Text> : null}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function Input(props) {
  return <TextInput style={s.input} placeholderTextColor="#9ca3af" {...props} />;
}

function SectionTitle({ title }) {
  return <Text style={s.sectionTitle}>{title}</Text>;
}

// ─── Camera Frame Modal ───────────────────────────────────────────────────────
function CameraFrameModal({ visible, onClose, onCapture, frameType = 'square' }) {
  const cameraRef = useRef(null);
  const [facing, setFacing] = useState('back');
  const [permission, requestPermission] = useCameraPermissions();

  const frameW = frameType === 'square' ? 260 : 300;
  const frameH = frameType === 'square' ? 260 : 190;

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      onCapture(photo);
      onClose();
    } catch {
      Alert.alert('Error', 'Could not capture photo. Please try again.');
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={cam.root}>
        {!permission?.granted ? (
          <View style={cam.permWrap}>
            <Text style={cam.permTitle}>Camera Access Required</Text>
            <Text style={cam.permMsg}>Please grant camera permission to take a photo.</Text>
            <TouchableOpacity style={cam.permBtn} onPress={requestPermission}>
              <Text style={cam.permBtnText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cam.cancelLink} onPress={onClose}>
              <Text style={cam.cancelLinkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CameraView ref={cameraRef} style={cam.camera} facing={facing}>
            {/* Darkened overlay with frame cutout */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {/* Top dark bar */}
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
              {/* Middle row */}
              <View style={{ flexDirection: 'row', height: frameH }}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                {/* Frame window */}
                <View style={{ width: frameW }}>
                  {/* Corner brackets */}
                  <View style={cam.cornerTL} />
                  <View style={cam.cornerTR} />
                  <View style={cam.cornerBL} />
                  <View style={cam.cornerBR} />
                </View>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
              </View>
              {/* Bottom dark bar */}
              <View style={{ flex: 2, backgroundColor: 'rgba(0,0,0,0.55)' }} />
            </View>

            {/* Close button */}
            <TouchableOpacity style={cam.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={cam.closeBtnText}>✕</Text>
            </TouchableOpacity>

            {/* Instruction hint */}
            <View style={cam.hintWrap} pointerEvents="none">
              <Text style={cam.hintText}>
                {frameType === 'square'
                  ? 'Position your face within the frame'
                  : 'Align your document within the frame'}
              </Text>
            </View>

            {/* Bottom controls */}
            <View style={cam.controls}>
              <TouchableOpacity
                style={cam.flipBtn}
                onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={cam.flipIcon}>⟳</Text>
                <Text style={cam.flipLabel}>Flip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={cam.captureRing} onPress={handleCapture} activeOpacity={0.7}>
                <View style={cam.captureDot} />
              </TouchableOpacity>
              <View style={{ width: 56 }} />
            </View>
          </CameraView>
        )}
      </View>
    </Modal>
  );
}

// ─── Main Wizard Screen ───────────────────────────────────────────────────────
export default function RegisterWizardScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // ── Step 1: Personal Details ──
  const [firstname, setFirstname] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastname, setLastname] = useState('');
  const [civilStatus, setCivilStatus] = useState('');
  const [spouseName, setSpouseName] = useState('');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [citizenship, setCitizenship] = useState('Filipino');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [tin, setTin] = useState('');
  const [sss, setSss] = useState('');
  const [highestEd, setHighestEd] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // ── Step 2: Addresses ──
  const [presentStreet, setPresentStreet] = useState('');
  const [presentBarangay, setPresentBarangay] = useState('');
  const [presentCity, setPresentCity] = useState('');
  const [presentProvince, setPresentProvince] = useState('');
  const [presentZip, setPresentZip] = useState('');
  const [sameAsPresent, setSameAsPresent] = useState(false);
  const [permStreet, setPermStreet] = useState('');
  const [permBarangay, setPermBarangay] = useState('');
  const [permCity, setPermCity] = useState('');
  const [permProvince, setPermProvince] = useState('');
  const [permZip, setPermZip] = useState('');

  // ── Step 3: Employment ──
  const [buksuId, setBuksuId] = useState('');
  const [empCategory, setEmpCategory] = useState('');
  const [empStatus, setEmpStatus] = useState('');
  const [office, setOffice] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');

  // ── Step 4: Parents ──
  const [fatherName, setFatherName] = useState('');
  const [fatherOccupation, setFatherOccupation] = useState('');
  const [fatherContact, setFatherContact] = useState('');
  const [motherName, setMotherName] = useState('');
  const [motherOccupation, setMotherOccupation] = useState('');
  const [motherContact, setMotherContact] = useState('');

  // ── Step 5: Beneficiaries ──
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [showBenefForm, setShowBenefForm] = useState(false);
  const [benName, setBenName] = useState('');
  const [benRelation, setBenRelation] = useState('');
  const [benDob, setBenDob] = useState('');
  const [benContact, setBenContact] = useState('');

  // ── Step 4 (extra): Emergency Contact ──
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyNumber, setEmergencyNumber] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');

  // ── Step 6: Documents ──
  const [idPhoto, setIdPhoto] = useState(null);
  const [payslip, setPayslip] = useState(null);
  const [coeDoc, setCoeDoc] = useState(null);

  // ── Camera modal ──
  const [cameraVisible, setCameraVisible] = useState(false);
  const [cameraFrameType, setCameraFrameType] = useState('square');
  const cameraSetterRef = useRef(null);

  const openCamera = (setter, frameType = 'square') => {
    cameraSetterRef.current = setter;
    setCameraFrameType(frameType);
    setCameraVisible(true);
  };

  const handleCameraCapture = (photo) => {
    if (cameraSetterRef.current) cameraSetterRef.current(photo);
    cameraSetterRef.current = null;
  };

  // ─── Validation ──────────────────────────────────────────────────────────
  const validate = () => {
    setError('');
    if (step === 1) {
      if (!firstname.trim()) return setError('First name is required.') || false;
      if (!lastname.trim()) return setError('Last name is required.') || false;
      if (!civilStatus) return setError('Civil status is required.') || false;
      if (civilStatus === 'married' && !spouseName.trim())
        return setError('Spouse name is required for married applicants.') || false;
      if (!gender) return setError('Gender is required.') || false;
      if (!dob.trim()) return setError('Date of birth is required.') || false;
      if (!citizenship.trim()) return setError('Citizenship is required.') || false;
      if (!contact.trim()) return setError('Contact number is required.') || false;
      if (!email.trim()) return setError('Email is required.') || false;
      const emailLower = email.toLowerCase();
      const validDomain = emailLower.endsWith('buksu.edu.ph') || (__DEV__ && emailLower.endsWith('gmail.com'));
      if (!validDomain)
        return setError('Only buksu.edu.ph email addresses are allowed.') || false;
      if (!password) return setError('Password is required.') || false;
      if (password.length < 8) return setError('Password must be at least 8 characters.') || false;
      if (password !== confirmPassword) return setError('Passwords do not match.') || false;
    }
    if (step === 2) {
      if (!presentStreet.trim()) return setError('House No./Street is required.') || false;
      if (!presentBarangay.trim()) return setError('Barangay is required.') || false;
      if (!presentCity.trim()) return setError('City/Municipality is required.') || false;
      if (!presentProvince.trim()) return setError('Province is required.') || false;
      if (!sameAsPresent) {
        if (!permStreet.trim()) return setError('Permanent: House No./Street is required.') || false;
        if (!permBarangay.trim()) return setError('Permanent: Barangay is required.') || false;
        if (!permCity.trim()) return setError('Permanent: City/Municipality is required.') || false;
        if (!permProvince.trim()) return setError('Permanent: Province is required.') || false;
      }
    }
    if (step === 3) {
      if (!buksuId.trim()) return setError('BukSU ID number is required.') || false;
      if (!empCategory) return setError('Employment category is required.') || false;
      if (!empStatus) return setError('Employment status is required.') || false;
      if (!office.trim()) return setError('Office/Department is required.') || false;
      if (!monthlyIncome.trim()) return setError('Monthly income is required.') || false;
      if (isNaN(Number(monthlyIncome)) || Number(monthlyIncome) <= 0) return setError('Monthly income must be a valid positive number.') || false;
    }
    if (step === 4) {
      if (!emergencyName.trim()) return setError('Emergency contact name is required.') || false;
      if (!emergencyNumber.trim()) return setError('Emergency contact number is required.') || false;
      if (!emergencyRelationship.trim()) return setError('Emergency contact relationship is required.') || false;
    }
    if (step === 6) {
      if (!idPhoto) return setError('2x2 ID photo is required.') || false;
      if (!payslip) return setError('Payslip is required.') || false;
      if (!coeDoc) return setError('Certificate of Employment is required.') || false;
    }
    return true;
  };

  const handleNext = () => {
    if (!validate()) return;
    setStep(s => s + 1);
  };

  const handleBack = () => {
    setError('');
    if (step > 1) setStep(s => s - 1);
    else navigation.goBack();
  };

  // ─── Image Pickers ───────────────────────────────────────────────────────
  const pickImage = async (setter, square = false) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: square,
      aspect: square ? [1, 1] : undefined,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length) setter(result.assets[0]);
  };

  const takePhoto = async (setter, square = false) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: square ? [1, 1] : [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length) setter(result.assets[0]);
  };

  // ─── Beneficiary helpers ─────────────────────────────────────────────────
  const addBeneficiary = () => {
    if (!benName.trim() || !benRelation.trim()) {
      setError('Beneficiary name and relationship are required.');
      return;
    }
    setBeneficiaries(prev => [...prev, {
      name: benName.trim(), relationship: benRelation.trim(),
      date_of_birth: benDob.trim() || null, contact_number: benContact.trim(),
    }]);
    setBenName(''); setBenRelation(''); setBenDob(''); setBenContact('');
    setShowBenefForm(false);
    setError('');
  };

  const removeBeneficiary = (idx) =>
    setBeneficiaries(prev => prev.filter((_, i) => i !== idx));

  // ─── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    setError('');
    try {
      const effectivePermStreet = sameAsPresent ? presentStreet : permStreet;
      const effectivePermBarangay = sameAsPresent ? presentBarangay : permBarangay;
      const effectivePermCity = sameAsPresent ? presentCity : permCity;
      const effectivePermProvince = sameAsPresent ? presentProvince : permProvince;
      const effectivePermZip = sameAsPresent ? presentZip : permZip;

      const formData = new FormData();
      formData.append('firstname', firstname.trim());
      formData.append('lastname', lastname.trim());
      formData.append('email', email.trim().toLowerCase());
      formData.append('password', password);
      formData.append('confirm_password', confirmPassword);
      formData.append('middle_name', middleName.trim());
      formData.append('civil_status', civilStatus);
      formData.append('spouse_name', spouseName.trim());
      formData.append('gender', gender);
      formData.append('date_of_birth', dob.trim());
      formData.append('citizenship', citizenship.trim());
      formData.append('contact_number', contact.trim());
      formData.append('tin', tin.trim());
      formData.append('sss_number', sss.trim());
      formData.append('highest_education', highestEd);
      formData.append('address_line1', presentStreet.trim());
      formData.append('address_line2', presentBarangay.trim());
      formData.append('city', presentCity.trim());
      formData.append('province', presentProvince.trim());
      formData.append('zip_code', presentZip.trim());
      formData.append('permanent_address_line1', effectivePermStreet.trim());
      formData.append('permanent_address_barangay', effectivePermBarangay.trim());
      formData.append('permanent_city', effectivePermCity.trim());
      formData.append('permanent_province', effectivePermProvince.trim());
      formData.append('permanent_zip_code', effectivePermZip.trim());
      formData.append('buksu_id_number', buksuId.trim());
      formData.append('employment_category', empCategory);
      formData.append('employment_status', empStatus);
      formData.append('office', office.trim());
      formData.append('monthly_income', monthlyIncome.trim());
      formData.append('father_name', fatherName.trim());
      formData.append('father_occupation', fatherOccupation.trim());
      formData.append('father_contact', fatherContact.trim());
      formData.append('mother_name', motherName.trim());
      formData.append('mother_occupation', motherOccupation.trim());
      formData.append('mother_contact', motherContact.trim());
      formData.append('emergency_contact_name', emergencyName.trim());
      formData.append('emergency_contact_number', emergencyNumber.trim());
      formData.append('emergency_contact_relationship', emergencyRelationship.trim());
      formData.append('beneficiaries', JSON.stringify(beneficiaries));

      if (idPhoto) {
        const ext = idPhoto.uri.split('.').pop() || 'jpg';
        formData.append('id_photo', {
          uri: idPhoto.uri,
          type: `image/${ext}`,
          name: `id_photo.${ext}`,
        });
      }
      if (payslip) {
        const ext = payslip.uri.split('.').pop() || 'jpg';
        formData.append('payslip', {
          uri: payslip.uri,
          type: `image/${ext}`,
          name: `payslip.${ext}`,
        });
      }
      if (coeDoc) {
        const ext = coeDoc.uri.split('.').pop() || 'jpg';
        formData.append('coe_document', {
          uri: coeDoc.uri,
          type: `image/${ext}`,
          name: `coe_document.${ext}`,
        });
      }

      const result = await authService.registerFull(formData);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error || 'Registration failed. Please try again.');
      }
    } catch {
      setError('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Success Screen ───────────────────────────────────────────────────────
  if (success) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.successWrap}>
          <View style={s.successIcon}><Text style={s.successIconText}>✓</Text></View>
          <Text style={s.successTitle}>Registration Submitted!</Text>
          <Text style={s.successMsg}>
            Your eLoan account has been created and is pending administrator approval.
          </Text>
          <Text style={s.successSub}>
            You will be notified once your account is reviewed by the Account Member Officer.
          </Text>
          <TouchableOpacity style={s.backToLoginBtn} onPress={() => navigation.navigate('Login')}>
            <Text style={s.backToLoginText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Step Renderers ───────────────────────────────────────────────────────
  const renderStep1 = () => (
    <View>
      <SectionTitle title="Name" />
      <Field label="First Name" required>
        <Input placeholder="Juan" value={firstname} onChangeText={setFirstname} autoCapitalize="words" />
      </Field>
      <Field label="Middle Name">
        <Input placeholder="Santos (optional)" value={middleName} onChangeText={setMiddleName} autoCapitalize="words" />
      </Field>
      <Field label="Last Name" required>
        <Input placeholder="Dela Cruz" value={lastname} onChangeText={setLastname} autoCapitalize="words" />
      </Field>

      <SectionTitle title="Personal Information" />
      <Field label="Civil Status" required>
        <Dropdown
          value={civilStatus} options={CIVIL_STATUS_OPTIONS}
          onChange={setCivilStatus} placeholder="Select civil status"
        />
      </Field>
      {civilStatus === 'married' && (
        <Field label="Spouse Name" required>
          <Input placeholder="Full name of spouse" value={spouseName} onChangeText={setSpouseName} autoCapitalize="words" />
        </Field>
      )}
      <Field label="Gender" required>
        <Dropdown value={gender} options={GENDER_OPTIONS} onChange={setGender} placeholder="Select gender" />
      </Field>
      <Field label="Date of Birth" required>
        <DatePickerField value={dob} onChange={setDob} />
      </Field>
      <Field label="Citizenship" required>
        <Input placeholder="Filipino" value={citizenship} onChangeText={setCitizenship} autoCapitalize="words" />
      </Field>

      <SectionTitle title="Contact & Credentials" />
      <Field label="Contact Number" required>
        <Input
          placeholder="09XXXXXXXXX" value={contact} onChangeText={setContact}
          keyboardType="phone-pad"
        />
      </Field>
      <Field label="Email Address" required>
        <Input
          placeholder="you@staff.buksu.edu.ph" value={email} onChangeText={setEmail}
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
        />
      </Field>
      <Field label="TIN Number">
        <Input placeholder="XXX-XXX-XXX" value={tin} onChangeText={setTin} keyboardType="numeric" />
      </Field>
      <Field label="SSS Number">
        <Input placeholder="XX-XXXXXXX-X" value={sss} onChangeText={setSss} />
      </Field>

      <SectionTitle title="Education" />
      <Field label="Highest Educational Attainment">
        <Dropdown
          value={highestEd} options={EDUCATION_OPTIONS}
          onChange={setHighestEd} placeholder="Select education level"
        />
      </Field>

      <SectionTitle title="Account Security" />
      <Field label="Password" required>
        <Input
          placeholder="Minimum 8 characters" value={password}
          onChangeText={setPassword} secureTextEntry
        />
      </Field>
      <Field label="Confirm Password" required>
        <Input
          placeholder="Re-enter password" value={confirmPassword}
          onChangeText={setConfirmPassword} secureTextEntry
        />
      </Field>
    </View>
  );

  const renderStep2 = () => (
    <View>
      <SectionTitle title="Present Address" />
      <Field label="House No. / Street" required>
        <Input placeholder="e.g. 123 Rizal Street" value={presentStreet} onChangeText={setPresentStreet} />
      </Field>
      <Field label="Barangay" required>
        <Input placeholder="e.g. Barangay Sto. Tomas" value={presentBarangay} onChangeText={setPresentBarangay} />
      </Field>
      <Field label="City / Municipality" required>
        <Input placeholder="e.g. Malaybalay City" value={presentCity} onChangeText={setPresentCity} />
      </Field>
      <Field label="Province" required>
        <Input placeholder="e.g. Bukidnon" value={presentProvince} onChangeText={setPresentProvince} />
      </Field>
      <Field label="Zip Code">
        <Input placeholder="e.g. 8700" value={presentZip} onChangeText={setPresentZip} keyboardType="numeric" />
      </Field>

      <SectionTitle title="Permanent Address" />
      <TouchableOpacity
        style={s.checkboxRow}
        onPress={() => setSameAsPresent(v => !v)}
        activeOpacity={0.7}
      >
        <View style={[s.checkbox, sameAsPresent && s.checkboxActive]}>
          {sameAsPresent && <Text style={s.checkmark}>✓</Text>}
        </View>
        <Text style={s.checkboxLabel}>Same as present address</Text>
      </TouchableOpacity>

      {!sameAsPresent && (
        <View>
          <Field label="House No. / Street" required>
            <Input placeholder="e.g. 123 Rizal Street" value={permStreet} onChangeText={setPermStreet} />
          </Field>
          <Field label="Barangay" required>
            <Input placeholder="e.g. Barangay Sto. Tomas" value={permBarangay} onChangeText={setPermBarangay} />
          </Field>
          <Field label="City / Municipality" required>
            <Input placeholder="e.g. Malaybalay City" value={permCity} onChangeText={setPermCity} />
          </Field>
          <Field label="Province" required>
            <Input placeholder="e.g. Bukidnon" value={permProvince} onChangeText={setPermProvince} />
          </Field>
          <Field label="Zip Code">
            <Input placeholder="e.g. 8700" value={permZip} onChangeText={setPermZip} keyboardType="numeric" />
          </Field>
        </View>
      )}
    </View>
  );

  const renderStep3 = () => (
    <View>
      <SectionTitle title="BukSU ID" />
      <Field label="BukSU ID Number" required>
        <Input placeholder="e.g. 2024-XXXXX" value={buksuId} onChangeText={setBuksuId} />
      </Field>

      <SectionTitle title="Employment Details" />
      <Field label="Employment Category" required>
        <Dropdown
          value={empCategory} options={EMP_CATEGORY_OPTIONS}
          onChange={setEmpCategory} placeholder="Select category"
        />
      </Field>
      <Field label="Employment Status" required>
        <Dropdown
          value={empStatus} options={EMP_STATUS_OPTIONS}
          onChange={setEmpStatus} placeholder="Select status"
        />
      </Field>
      <Field label="Office / Department" required>
        <Input placeholder="e.g. College of Computing Education" value={office} onChangeText={setOffice} />
      </Field>
      <Field label="Monthly Income (PHP)" required>
        <Input
          placeholder="e.g. 25000" value={monthlyIncome}
          onChangeText={setMonthlyIncome} keyboardType="numeric"
        />
      </Field>
    </View>
  );

  const renderStep4 = () => (
    <View>
      <SectionTitle title="Father's Information" />
      <Field label="Father's Name">
        <Input placeholder="Full name" value={fatherName} onChangeText={setFatherName} autoCapitalize="words" />
      </Field>
      <Field label="Father's Occupation">
        <Input placeholder="e.g. Farmer" value={fatherOccupation} onChangeText={setFatherOccupation} autoCapitalize="words" />
      </Field>
      <Field label="Father's Contact Number">
        <Input placeholder="09XXXXXXXXX" value={fatherContact} onChangeText={setFatherContact} keyboardType="phone-pad" />
      </Field>

      <SectionTitle title="Mother's Information" />
      <Field label="Mother's Name">
        <Input placeholder="Full name" value={motherName} onChangeText={setMotherName} autoCapitalize="words" />
      </Field>
      <Field label="Mother's Occupation">
        <Input placeholder="e.g. Housewife" value={motherOccupation} onChangeText={setMotherOccupation} autoCapitalize="words" />
      </Field>
      <Field label="Mother's Contact Number">
        <Input placeholder="09XXXXXXXXX" value={motherContact} onChangeText={setMotherContact} keyboardType="phone-pad" />
      </Field>

      <SectionTitle title="Emergency Contact" />
      <Field label="Full Name" required>
        <Input placeholder="Full name of contact person" value={emergencyName} onChangeText={setEmergencyName} autoCapitalize="words" />
      </Field>
      <Field label="Contact Number" required>
        <Input placeholder="09XXXXXXXXX" value={emergencyNumber} onChangeText={setEmergencyNumber} keyboardType="phone-pad" />
      </Field>
      <Field label="Relationship" required>
        <Input placeholder="e.g. Spouse, Parent, Sibling" value={emergencyRelationship} onChangeText={setEmergencyRelationship} autoCapitalize="words" />
      </Field>
    </View>
  );

  const renderStep5 = () => (
    <View>
      <Text style={s.stepNote}>
        Declare your beneficiaries. You may skip this step if not applicable.
      </Text>

      {beneficiaries.length > 0 && (
        <View style={s.benefList}>
          {beneficiaries.map((b, i) => (
            <View key={i} style={s.benefCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.benefName}>{b.name}</Text>
                <Text style={s.benefSub}>{b.relationship}{b.contact_number ? ` · ${b.contact_number}` : ''}</Text>
                {b.date_of_birth ? <Text style={s.benefSub}>DOB: {b.date_of_birth}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => removeBeneficiary(i)} style={s.removeBtn}>
                <Text style={s.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {showBenefForm ? (
        <View style={s.benefForm}>
          <SectionTitle title="New Beneficiary" />
          <Field label="Name" required>
            <Input placeholder="Full name" value={benName} onChangeText={setBenName} autoCapitalize="words" />
          </Field>
          <Field label="Relationship" required>
            <Input placeholder="e.g. Spouse, Child, Sibling" value={benRelation} onChangeText={setBenRelation} autoCapitalize="words" />
          </Field>
          <Field label="Date of Birth">
            <Input placeholder="YYYY-MM-DD" value={benDob} onChangeText={setBenDob} keyboardType="numeric" />
          </Field>
          <Field label="Contact Number">
            <Input placeholder="09XXXXXXXXX" value={benContact} onChangeText={setBenContact} keyboardType="phone-pad" />
          </Field>
          <View style={s.benefActions}>
            <TouchableOpacity style={s.addBtn} onPress={addBeneficiary}>
              <Text style={s.addBtnText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={() => { setShowBenefForm(false); setBenName(''); setBenRelation(''); setBenDob(''); setBenContact(''); setError(''); }}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={s.addBenefBtn} onPress={() => setShowBenefForm(true)}>
          <Text style={s.addBenefBtnText}>+ Add Beneficiary</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderStep6 = () => (
    <View>
      {/* 2×2 ID Photo */}
      <SectionTitle title="2×2 ID Photo" />
      <Text style={s.docHint}>Use a plain background. Face must be clearly visible.</Text>
      {idPhoto ? (
        <View style={s.photoPreviewWrap}>
          <Image source={{ uri: idPhoto.uri }} style={s.idPhotoPreview} />
          <TouchableOpacity style={s.retakeBtn} onPress={() => setIdPhoto(null)}>
            <Text style={s.retakeBtnText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.docBtns}>
          <TouchableOpacity style={s.docBtn} onPress={() => openCamera(setIdPhoto, 'square')}>
            <Text style={s.docBtnIcon}>📷</Text>
            <Text style={s.docBtnText}>Take Photo</Text>
            <Text style={s.docBtnSub}>with frame guide</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.docBtn} onPress={() => pickImage(setIdPhoto, true)}>
            <Text style={s.docBtnIcon}>🖼️</Text>
            <Text style={s.docBtnText}>Choose from Gallery</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Payslip */}
      <SectionTitle title="Payslip (Proof of Income)" />
      <Text style={s.docHint}>Upload your latest payslip as proof of your monthly income.</Text>
      {payslip ? (
        <View style={s.photoPreviewWrap}>
          <Image source={{ uri: payslip.uri }} style={s.payslipPreview} />
          <TouchableOpacity style={s.retakeBtn} onPress={() => setPayslip(null)}>
            <Text style={s.retakeBtnText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.docBtns}>
          <TouchableOpacity style={s.docBtn} onPress={() => openCamera(setPayslip, 'rect')}>
            <Text style={s.docBtnIcon}>📷</Text>
            <Text style={s.docBtnText}>Take Photo</Text>
            <Text style={s.docBtnSub}>with frame guide</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.docBtn} onPress={() => pickImage(setPayslip, false)}>
            <Text style={s.docBtnIcon}>🖼️</Text>
            <Text style={s.docBtnText}>Choose from Gallery</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Certificate of Employment */}
      <SectionTitle title="Certificate of Employment *" />
      <Text style={s.docHint}>Upload your Certificate of Employment (COE) as proof of employment status.</Text>
      {coeDoc ? (
        <View style={s.photoPreviewWrap}>
          <Image source={{ uri: coeDoc.uri }} style={s.payslipPreview} />
          <TouchableOpacity style={s.retakeBtn} onPress={() => setCoeDoc(null)}>
            <Text style={s.retakeBtnText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.docBtns}>
          <TouchableOpacity style={s.docBtn} onPress={() => openCamera(setCoeDoc, 'rect')}>
            <Text style={s.docBtnIcon}>📷</Text>
            <Text style={s.docBtnText}>Take Photo</Text>
            <Text style={s.docBtnSub}>with frame guide</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.docBtn} onPress={() => pickImage(setCoeDoc, false)}>
            <Text style={s.docBtnIcon}>🖼️</Text>
            <Text style={s.docBtnText}>Choose from Gallery</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // ─── Main Render ──────────────────────────────────────────────────────────
  const stepRenderers = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6];
  const isLastStep = step === 6;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.stepLabel}>Step {step} of 6</Text>
          <Text style={s.stepTitle}>{STEP_TITLES[step - 1]}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress bar */}
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${(step / 6) * 100}%` }]} />
      </View>

      {/* Step dots */}
      <View style={s.dotsRow}>
        {STEP_TITLES.map((_, i) => (
          <View key={i} style={[s.dot, i + 1 <= step && s.dotActive]} />
        ))}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Error */}
          {error ? (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Step content */}
          {stepRenderers[step - 1]()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom navigation */}
      <View style={s.navBar}>
        <TouchableOpacity style={s.navBack} onPress={handleBack} disabled={loading}>
          <Text style={s.navBackText}>{step === 1 ? 'Cancel' : 'Back'}</Text>
        </TouchableOpacity>
        {isLastStep ? (
          <TouchableOpacity
            style={[s.navNext, loading && s.navNextDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.navNextText}>Submit Registration</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.navNext} onPress={handleNext} disabled={loading}>
            <Text style={s.navNextText}>Next  ›</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Camera frame modal */}
      <CameraFrameModal
        visible={cameraVisible}
        frameType={cameraFrameType}
        onCapture={handleCameraCapture}
        onClose={() => setCameraVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── Dropdown Styles ──────────────────────────────────────────────────────────
const dd = StyleSheet.create({
  wrapper: { marginBottom: 0 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#d1d5db',
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 13,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 15, color: '#1f2937', flex: 1 },
  placeholder: { color: '#9ca3af' },
  arrow: { fontSize: 12, color: '#6b7280' },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  menu: {
    backgroundColor: '#fff', borderRadius: 12, width: '100%',
    paddingVertical: 8, elevation: 8,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12,
  },
  menuTitle: {
    fontSize: 13, fontWeight: '700', color: '#6b7280',
    paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  itemActive: { backgroundColor: '#eff6ff' },
  itemText: { flex: 1, fontSize: 15, color: '#1f2937' },
  itemTextActive: { color: '#02327a', fontWeight: '600' },
  check: { fontSize: 14, color: '#02327a', fontWeight: '700' },
});

// ─── Date Picker Styles ───────────────────────────────────────────────────────
const dp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  cancel: { fontSize: 14, color: '#6b7280' },
  columns: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  colWrap: { flex: 1 },
  colLabel: {
    fontSize: 11, fontWeight: '700', color: '#9ca3af', textAlign: 'center',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  col: { height: 210, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10 },
  item: { paddingVertical: 11, paddingHorizontal: 8, alignItems: 'center' },
  itemSel: { backgroundColor: '#eff6ff' },
  itemText: { fontSize: 14, color: '#374151' },
  itemTextSel: { color: '#02327a', fontWeight: '700' },
  confirmBtn: {
    marginHorizontal: 20, marginTop: 16, backgroundColor: '#02327a',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

// ─── Main Styles ──────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  backArrow: { fontSize: 28, color: '#02327a', lineHeight: 32 },
  headerCenter: { flex: 1, alignItems: 'center' },
  stepLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  stepTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginTop: 2 },

  // Progress
  progressTrack: { height: 4, backgroundColor: '#e5e7eb' },
  progressFill: { height: 4, backgroundColor: '#02327a', borderRadius: 2 },
  dotsRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingVertical: 10, backgroundColor: '#fff', gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d1d5db' },
  dotActive: { backgroundColor: '#02327a' },

  // Content
  scrollContent: { padding: 20, paddingBottom: 16 },
  errorBox: {
    backgroundColor: '#fee2e2', borderRadius: 8, padding: 12, marginBottom: 16,
  },
  errorText: { color: '#dc2626', fontSize: 14 },

  // Fields
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  req: { color: '#dc2626' },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#d1d5db',
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: '#1f2937',
  },
  sectionTitle: {
    fontSize: 14, fontWeight: '700', color: '#02327a',
    marginTop: 8, marginBottom: 12, paddingBottom: 6,
    borderBottomWidth: 1.5, borderBottomColor: '#dbeafe',
  },

  // Checkbox (same as present)
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, marginTop: 4 },
  checkbox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: '#d1d5db',
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  checkboxActive: { backgroundColor: '#02327a', borderColor: '#02327a' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  checkboxLabel: { fontSize: 15, color: '#1f2937' },

  // Step note
  stepNote: { fontSize: 14, color: '#6b7280', marginBottom: 16, lineHeight: 20 },

  // Beneficiaries
  benefList: { marginBottom: 12 },
  benefCard: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff',
    borderRadius: 10, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#e5e7eb', elevation: 1,
  },
  benefName: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  benefSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  removeBtn: { padding: 4 },
  removeBtnText: { fontSize: 16, color: '#ef4444', fontWeight: '700' },
  benefForm: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#dbeafe', marginBottom: 12,
  },
  benefActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  addBtn: {
    flex: 1, backgroundColor: '#02327a', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: {
    flex: 1, backgroundColor: '#f3f4f6', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  cancelBtnText: { color: '#6b7280', fontWeight: '600', fontSize: 15 },
  addBenefBtn: {
    borderWidth: 2, borderColor: '#02327a', borderStyle: 'dashed',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  addBenefBtnText: { color: '#02327a', fontWeight: '700', fontSize: 15 },

  // Documents
  docHint: { fontSize: 13, color: '#6b7280', marginBottom: 12, lineHeight: 19 },
  docBtns: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  docBtn: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 20,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#d1d5db', elevation: 1,
  },
  docBtnIcon: { fontSize: 28, marginBottom: 8 },
  docBtnText: { fontSize: 13, color: '#374151', fontWeight: '600', textAlign: 'center' },
  docBtnSub: { fontSize: 11, color: '#9ca3af', marginTop: 3, textAlign: 'center' },
  photoPreviewWrap: { alignItems: 'center', marginBottom: 20 },
  idPhotoPreview: { width: 150, height: 150, borderRadius: 8, borderWidth: 2, borderColor: '#02327a' },
  payslipPreview: { width: '100%', height: 180, borderRadius: 8, borderWidth: 2, borderColor: '#02327a', resizeMode: 'cover' },
  retakeBtn: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 20, backgroundColor: '#fee2e2', borderRadius: 8 },
  retakeBtnText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },

  // Bottom nav bar
  navBar: {
    flexDirection: 'row', gap: 12, padding: 16,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  navBack: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderRadius: 8, borderWidth: 1.5, borderColor: '#d1d5db',
  },
  navBackText: { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  navNext: {
    flex: 2, paddingVertical: 14, alignItems: 'center',
    borderRadius: 8, backgroundColor: '#02327a',
  },
  navNextDisabled: { opacity: 0.5 },
  navNextText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Success
  successWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  successIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#10b981',
    justifyContent: 'center', alignItems: 'center', marginBottom: 24,
  },
  successIconText: { fontSize: 40, color: '#fff' },
  successTitle: { fontSize: 24, fontWeight: '700', color: '#1f2937', marginBottom: 12, textAlign: 'center' },
  successMsg: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  successSub: { fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  backToLoginBtn: {
    backgroundColor: '#02327a', borderRadius: 8,
    paddingVertical: 14, paddingHorizontal: 32,
  },
  backToLoginText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

// ─── Camera Frame Modal Styles ────────────────────────────────────────────────
const CORNER_LEN = 22;
const CORNER_THICK = 3;
const CORNER_COLOR = '#fff';

const cam = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },

  // Permission screen
  permWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#111' },
  permTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 10, textAlign: 'center' },
  permMsg: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  permBtn: {
    backgroundColor: '#02327a', borderRadius: 8,
    paddingVertical: 14, paddingHorizontal: 32, marginBottom: 14,
  },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelLink: { paddingVertical: 10 },
  cancelLinkText: { color: '#9ca3af', fontSize: 14 },

  // Close button (top-left)
  closeBtn: {
    position: 'absolute', top: 52, left: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  // Hint text (above the frame)
  hintWrap: {
    position: 'absolute', top: '28%', left: 0, right: 0,
    alignItems: 'center',
  },
  hintText: {
    color: '#fff', fontSize: 13, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    overflow: 'hidden',
  },

  // Corner bracket markers
  cornerTL: {
    position: 'absolute', top: 0, left: 0,
    width: CORNER_LEN, height: CORNER_LEN,
    borderTopWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK,
    borderColor: CORNER_COLOR, borderTopLeftRadius: 3,
  },
  cornerTR: {
    position: 'absolute', top: 0, right: 0,
    width: CORNER_LEN, height: CORNER_LEN,
    borderTopWidth: CORNER_THICK, borderRightWidth: CORNER_THICK,
    borderColor: CORNER_COLOR, borderTopRightRadius: 3,
  },
  cornerBL: {
    position: 'absolute', bottom: 0, left: 0,
    width: CORNER_LEN, height: CORNER_LEN,
    borderBottomWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK,
    borderColor: CORNER_COLOR, borderBottomLeftRadius: 3,
  },
  cornerBR: {
    position: 'absolute', bottom: 0, right: 0,
    width: CORNER_LEN, height: CORNER_LEN,
    borderBottomWidth: CORNER_THICK, borderRightWidth: CORNER_THICK,
    borderColor: CORNER_COLOR, borderBottomRightRadius: 3,
  },

  // Bottom controls
  controls: {
    position: 'absolute', bottom: 48, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 40,
  },
  flipBtn: { width: 56, alignItems: 'center' },
  flipIcon: { fontSize: 26, color: '#fff' },
  flipLabel: { fontSize: 11, color: '#e5e7eb', marginTop: 3 },
  captureRing: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  captureDot: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#fff',
  },
});
