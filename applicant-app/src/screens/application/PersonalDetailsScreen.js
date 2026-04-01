/**
 * Personal Details Screen (Step 2)
 * Pre-fills from registration profile data. Fields are editable to allow corrections.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApplication } from '../../context/ApplicationContext';
import profileService from '../../services/profileService';
import { getLoanTypeDraft, saveLoanTypeDraft } from '../../utils/applicationDraftStorage';
import DropdownPicker from '../../components/DropdownPicker';

const EMPLOYMENT_STATUS_OPTIONS = [
  { label: 'Permanent', value: 'permanent' },
  { label: 'Temporary', value: 'temporary' },
  { label: 'Casual', value: 'casual' },
  { label: 'Part-Time', value: 'part_time' },
  { label: 'Job Order', value: 'job_order' },
];

const CIVIL_STATUS_OPTIONS = [
  { label: 'Single', value: 'single' },
  { label: 'Married', value: 'married' },
  { label: 'Widowed', value: 'widowed' },
  { label: 'Separated', value: 'separated' },
];

export default function PersonalDetailsScreen({ navigation }) {
  const { state, setPersonalDetails, dispatch } = useApplication();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [contactNumber, setContactNumber] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [employerName, setEmployerName] = useState('');
  const [position, setPosition] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('');
  const [civilStatus, setCivilStatus] = useState('');
  const [tin, setTin] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  useEffect(() => {
    loadAutofillData();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!state.loanType?.id || !state.applicationId) return;
      saveLoanTypeDraft(state.loanType.id, {
        applicationId: state.applicationId,
        currentStep: 2,
        personalDetails: {
          contactNumber, addressLine1, city, province, zipCode,
          employerName, position, monthlyIncome,
          employmentStatus, civilStatus, tin, dateOfBirth,
        },
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [
    state.loanType?.id, state.applicationId,
    contactNumber, addressLine1, city, province, zipCode,
    employerName, position, monthlyIncome,
    employmentStatus, civilStatus, tin, dateOfBirth,
  ]);

  const loadAutofillData = async () => {
    try {
      const data = await profileService.getAutofillData();

      // Start with profile data
      setContactNumber(data.contact_number || '');
      setAddressLine1(data.address_line1 || '');
      setCity(data.city || '');
      setProvince(data.province || '');
      setZipCode(data.zip_code || '');
      setEmployerName(data.employer_name || '');
      setPosition(data.position || '');
      setMonthlyIncome(data.monthly_income ? String(data.monthly_income) : '');
      setEmploymentStatus(data.employment_status || '');
      setCivilStatus(data.civil_status || '');
      setTin(data.tin || '');
      setDateOfBirth(data.date_of_birth || '');

      // Override with any locally saved draft values
      if (state.loanType?.id && state.applicationId) {
        const localDraft = await getLoanTypeDraft(state.loanType.id);
        const local =
          localDraft?.applicationId === state.applicationId
            ? localDraft.personalDetails || {}
            : {};

        setContactNumber(local.contactNumber    ?? data.contact_number    ?? '');
        setAddressLine1(local.addressLine1      ?? data.address_line1     ?? '');
        setCity(local.city                       ?? data.city              ?? '');
        setProvince(local.province               ?? data.province          ?? '');
        setZipCode(local.zipCode                 ?? data.zip_code          ?? '');
        setEmployerName(local.employerName       ?? data.employer_name     ?? '');
        setPosition(local.position               ?? data.position          ?? '');
        setMonthlyIncome(local.monthlyIncome     ?? (data.monthly_income ? String(data.monthly_income) : '') ?? '');
        setEmploymentStatus(local.employmentStatus ?? data.employment_status ?? '');
        setCivilStatus(local.civilStatus         ?? data.civil_status      ?? '');
        setTin(local.tin                         ?? data.tin               ?? '');
        setDateOfBirth(local.dateOfBirth         ?? data.date_of_birth     ?? '');
      }
    } catch (error) {
      console.error('Load autofill error:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    if (!contactNumber.trim()) {
      Alert.alert('Validation Error', 'Contact number is required');
      return false;
    }
    if (!addressLine1.trim()) {
      Alert.alert('Validation Error', 'Address is required');
      return false;
    }
    if (!employerName.trim()) {
      Alert.alert('Validation Error', 'Office / Department is required');
      return false;
    }
    if (!monthlyIncome || isNaN(parseFloat(monthlyIncome)) || parseFloat(monthlyIncome) <= 0) {
      Alert.alert('Validation Error', 'Monthly income is required');
      return false;
    }
    if (!employmentStatus) {
      Alert.alert('Validation Error', 'Employment status is required');
      return false;
    }
    return true;
  };

  const handleContinue = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      await profileService.updateProfile({
        contact_number:    contactNumber,
        address_line1:     addressLine1,
        city,
        province,
        zip_code:          zipCode,
        employer_name:     employerName,
        position,
        monthly_income:    monthlyIncome || null,
        employment_status: employmentStatus || null,
        civil_status:      civilStatus || null,
        tin:               tin || null,
        date_of_birth:     dateOfBirth || null,
      });

      const details = {
        contactNumber, addressLine1, city, province, zipCode,
        employerName, position, monthlyIncome,
        employmentStatus, civilStatus, tin, dateOfBirth,
      };

      setPersonalDetails(details);
      dispatch({ type: 'VALIDATE_PERSONAL_DETAILS', payload: true });
      dispatch({ type: 'SET_CURRENT_STEP', payload: 3 });

      if (state.loanType?.id && state.applicationId) {
        await saveLoanTypeDraft(state.loanType.id, {
          applicationId: state.applicationId,
          currentStep: 3,
          personalDetails: details,
        });
      }

      navigation.navigate('LoanDetails');
    } catch (error) {
      console.error('Save profile error:', error);
      Alert.alert('Error', 'Failed to save personal details');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['bottom']}>
        <ActivityIndicator size="large" color="#17236a" />
        <Text style={styles.loadingText}>Loading your information...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Progress */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: '25%' }]} />
          </View>
          <Text style={styles.progressText}>Step 2 of 8</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.instructions}>
            <Text style={styles.instructionTitle}>Personal Details</Text>
            <Text style={styles.instructionText}>
              Your registration details are pre-filled below. Please verify and update if needed.
            </Text>
          </View>

          {/* Contact Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact Information</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Contact Number *</Text>
              <TextInput
                style={styles.input}
                value={contactNumber}
                onChangeText={setContactNumber}
                placeholder="09XX XXX XXXX"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Address */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Address</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Complete Address *</Text>
              <TextInput
                style={styles.input}
                value={addressLine1}
                onChangeText={setAddressLine1}
                placeholder="House/Unit No., Street, Barangay"
              />
            </View>
            <View style={styles.row}>
              <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>City</Text>
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                />
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Province</Text>
                <TextInput
                  style={styles.input}
                  value={province}
                  onChangeText={setProvince}
                  placeholder="Province"
                />
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>ZIP Code</Text>
              <TextInput
                style={[styles.input, { width: 120 }]}
                value={zipCode}
                onChangeText={setZipCode}
                placeholder="ZIP"
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Personal Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Information</Text>
            <View style={styles.field}>
              <DropdownPicker
                label="Civil Status"
                placeholder="Select civil status"
                value={civilStatus || null}
                options={CIVIL_STATUS_OPTIONS}
                onChange={(val) => setCivilStatus(val)}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Date of Birth</Text>
              <TextInput
                style={styles.input}
                value={dateOfBirth}
                onChangeText={setDateOfBirth}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>TIN (Tax Identification Number)</Text>
              <TextInput
                style={styles.input}
                value={tin}
                onChangeText={setTin}
                placeholder="XXX-XXX-XXX"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          {/* Employment */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Employment Information</Text>
            <View style={styles.field}>
              <DropdownPicker
                label="Employment Status *"
                placeholder="Select employment status"
                value={employmentStatus || null}
                options={EMPLOYMENT_STATUS_OPTIONS}
                onChange={(val) => setEmploymentStatus(val)}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Office / Department *</Text>
              <TextInput
                style={styles.input}
                value={employerName}
                onChangeText={setEmployerName}
                placeholder="Office/Department Name"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Position</Text>
              <TextInput
                style={styles.input}
                value={position}
                onChangeText={setPosition}
                placeholder="Your Position/Title"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Monthly Income *</Text>
              <TextInput
                style={styles.input}
                value={monthlyIncome}
                onChangeText={setMonthlyIncome}
                placeholder="₱0.00"
                keyboardType="numeric"
              />
            </View>
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.continueButton, saving && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.continueButtonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  progressContainer: {
    padding: 16,
    paddingBottom: 0,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#17236a',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'right',
  },
  scrollContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  instructions: {
    marginBottom: 16,
  },
  instructionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  instructionText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 2, elevation: 1,
  },
  sectionTitle: {
    fontSize: 14, fontWeight: '600', color: '#6b7280',
    marginBottom: 16, textTransform: 'uppercase',
  },
  field:  { marginBottom: 16 },
  row:    { flexDirection: 'row' },
  label:  { fontSize: 13, color: '#374151', marginBottom: 6, fontWeight: '500' },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 15, color: '#1f2937', backgroundColor: '#fff',
  },
  footer: {
    flexDirection: 'row', padding: 16, paddingTop: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb',
    position: 'absolute', bottom: 0, left: 0, right: 0,
  },
  backButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginRight: 8,
  },
  backButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  continueButton: {
    flex: 2,
    backgroundColor: '#17236a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
