import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApplication } from '../../context/ApplicationContext';
import applicationService from '../../services/applicationService';
import { clearLoanTypeDraft } from '../../utils/applicationDraftStorage';
import { getLoanTypeConfig, hasExtraStep } from '../../config/loanTypeConfig';

const REQUIRED_DOCUMENT_KEYS = ['buksu_id', 'proof_of_income', 'membership_certificate'];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const mapDocumentsByType = (documents = []) => {
  const mapped = {};

  documents.forEach((doc) => {
    const normalized = {
      id: doc.id,
      uri: doc.file_path,
      name: doc.document_name,
      uploaded: true,
    };

    if (doc.document_type === 'other_documents') {
      if (!mapped.other_documents) {
        mapped.other_documents = [];
      }
      mapped.other_documents.push(normalized);
      return;
    }

    mapped[doc.document_type] = normalized;
  });

  return mapped;
};

const ReviewSubmitScreen = ({ navigation }) => {
  const { state, dispatch } = useApplication();
  const [loading, setLoading] = useState(false);
  const [applicationData, setApplicationData] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    loanDetails: true,
    loanSpecific: false,
    personalInfo: false,
    coMakers: false,
    documents: false,
  });

  useEffect(() => {
    if (state.applicationId) {
      fetchApplicationDetails();
    }
  }, [state.applicationId]);

  const fetchApplicationDetails = async () => {
    if (!state.applicationId) {
      Alert.alert('Error', 'No application selected.');
      return;
    }
    setLoading(true);
    try {
      const response = await applicationService.getApplication(state.applicationId);
      setApplicationData(response);
    } catch (error) {
      console.error('Fetch error:', error);
      Alert.alert('Error', 'Failed to load application details');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount || 0);
  };

  const handleSubmit = async () => {
    if (!state.applicationId) {
      Alert.alert('Error', 'No application selected.');
      return;
    }
    Alert.alert(
      'Submit Application',
      'Are you sure you want to submit your loan application? You can still edit while the application remains pending.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'default',
          onPress: async () => {
            setLoading(true);
            try {
              await applicationService.submitApplication(state.applicationId);

              const selectedTypeId =
                state.loanType?.id || state.selectedLoanType?.id;
              if (selectedTypeId) {
                await clearLoanTypeDraft(selectedTypeId);
              }

              dispatch({ type: 'RESET_APPLICATION' });

              Alert.alert(
                'Application Submitted!',
                'Your loan application has been successfully submitted. You will receive notifications about its status.',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      navigation.reset({
                        index: 0,
                        routes: [{ name: 'Main' }],
                      });
                    },
                  },
                ]
              );
            } catch (error) {
              console.error('Submit error:', error);

              // Handle validation errors from backend
              let errorMessage = 'Failed to submit application. Please try again.';

              if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
                // Backend returns array of validation errors
                errorMessage = error.response.data.errors.join('\n\n');
              } else if (error.response?.data?.error) {
                // Backend returns single error message
                errorMessage = error.response.data.error;
              } else if (error.response?.data?.message) {
                errorMessage = error.response.data.message;
              }

              Alert.alert(
                'Submission Failed',
                errorMessage
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const renderSectionHeader = (title, section, icon, isComplete = true) => (
    <TouchableOpacity
      style={styles.sectionHeader}
      onPress={() => toggleSection(section)}
    >
      <View style={styles.sectionHeaderLeft}>
        <View style={[styles.sectionIcon, isComplete ? styles.sectionIconComplete : styles.sectionIconIncomplete]}>
          <Ionicons name={icon} size={20} color={isComplete ? '#28a745' : '#dc3545'} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Ionicons
        name={expandedSections[section] ? 'chevron-up' : 'chevron-down'}
        size={24}
        color="#6c757d"
      />
    </TouchableOpacity>
  );

  const renderInfoRow = (label, value, important = false) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, important && styles.infoValueImportant]}>
        {value || '-'}
      </Text>
    </View>
  );

  if (loading && !applicationData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0d6efd" />
        <Text style={styles.loadingText}>Loading application details...</Text>
      </View>
    );
  }

  const data = applicationData || {};
  const loanType = state.loanType || state.selectedLoanType || data.loan_type || {};

  const rawLoanDetails = state.loanDetails || {};
  const loanAmount = rawLoanDetails.amount || data.amount_requested;
  const termMonths = rawLoanDetails.termMonths || data.term_months;
  const monthlyAmortization =
    rawLoanDetails.calculatedAmortization || data.monthly_amortization;
  const totalPayable = rawLoanDetails.calculatedTotal || data.total_payable;
  const totalInterest =
    rawLoanDetails.calculatedInterest ||
    (toNumber(totalPayable) > 0 && toNumber(loanAmount) > 0
      ? toNumber(totalPayable) - toNumber(loanAmount)
      : null);

  const loanDetails = {
    amount: loanAmount,
    termMonths,
    purpose: rawLoanDetails.purpose || data.purpose,
    monthlyAmortization,
    totalPayable,
    totalInterest,
  };

  const personalDetails = state.personalDetails || {};
  const personalInfo = {
    contactNumber: personalDetails.contactNumber,
    addressLine1: personalDetails.addressLine1,
    addressLine2: personalDetails.addressLine2,
    city: personalDetails.city,
    province: personalDetails.province,
    zipCode: personalDetails.zipCode,
    employerName: personalDetails.employerName,
    position: personalDetails.position,
    monthlyIncome: personalDetails.monthlyIncome,
    yearsEmployed: personalDetails.yearsEmployed,
    emergencyContactName: personalDetails.emergencyContactName,
    emergencyContactNumber: personalDetails.emergencyContactNumber,
  };

  const coMakers = (state.coMakers && state.coMakers.length > 0
    ? state.coMakers
    : data.comakers) || [];

  const documents = Array.isArray(state.documents)
    ? (state.documents.length > 0 ? state.documents : mapDocumentsByType(data.documents || []))
    : (Object.keys(state.documents || {}).length > 0
      ? state.documents
      : mapDocumentsByType(data.documents || []));

  const documentCount = Object.keys(documents).filter((key) =>
    key === 'other_documents' ? documents[key]?.length > 0 : documents[key]
  ).length;
  const requiredUploadedCount = REQUIRED_DOCUMENT_KEYS.filter((key) =>
    key === 'other_documents' ? documents[key]?.length > 0 : documents[key]
  ).length;

  return (
    <View style={styles.container}>
      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: '100%' }]} />
        </View>
        <Text style={styles.progressText}>Step 7 of 7</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Review & Submit</Text>
        <Text style={styles.subtitle}>
          Please review all the information below before submitting your application.
        </Text>

        {/* Application Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.loanTypeIcon}>
              <Ionicons name="cash" size={28} color="#fff" />
            </View>
            <View style={styles.summaryHeaderText}>
              <Text style={styles.loanTypeName}>{loanType.loan_name || 'Loan Application'}</Text>
              <Text style={styles.applicationId}>
                Application #{state.applicationId || 'DRAFT'}
              </Text>
            </View>
          </View>
          <View style={styles.summaryDetails}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Loan Amount</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(loanDetails.amount)}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Term</Text>
              <Text style={styles.summaryValue}>
                {loanDetails.termMonths || 0} months
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Monthly Payment</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(loanDetails.monthlyAmortization)}
              </Text>
            </View>
          </View>
        </View>

        {/* Loan Details Section */}
        <View style={styles.section}>
          {renderSectionHeader('Loan Details', 'loanDetails', 'document-text')}
          {expandedSections.loanDetails && (
            <View style={styles.sectionContent}>
              {renderInfoRow('Loan Type', loanType.loan_name)}
              {renderInfoRow('Amount Requested', formatCurrency(loanDetails.amount), true)}
              {renderInfoRow('Loan Term', `${loanDetails.termMonths || 0} months`)}
              {renderInfoRow('Interest Rate', `${loanType.interest_rate || 0}% per annum`)}
              {renderInfoRow('Monthly Payment', formatCurrency(loanDetails.monthlyAmortization), true)}
              {renderInfoRow('Total Payable', formatCurrency(loanDetails.totalPayable))}
              {renderInfoRow('Total Interest', formatCurrency(loanDetails.totalInterest))}
              {renderInfoRow('Purpose', loanDetails.purpose)}
            </View>
          )}
        </View>

        {/* Loan-Specific Details Section (ATM, Gadget, LAD, Emergency) */}
        {hasExtraStep(loanType?.loan_name) && Object.keys(state.loanFormData || {}).length > 0 && (
          <View style={styles.section}>
            {renderSectionHeader(
              getLoanTypeConfig(loanType.loan_name).extraStepTitle || 'Additional Details',
              'loanSpecific',
              'list',
              true
            )}
            {expandedSections.loanSpecific && (
              <View style={styles.sectionContent}>
                {getLoanTypeConfig(loanType.loan_name).extraFields?.map((field) => {
                  const val = (state.loanFormData || {})[field.key];
                  const display = field.type === 'currency'
                    ? val ? `₱${parseFloat(val).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '-'
                    : val || '-';
                  return renderInfoRow(field.label, display);
                })}
              </View>
            )}
          </View>
        )}

        {/* Personal Information Section */}
        <View style={styles.section}>
          {renderSectionHeader('Personal Information', 'personalInfo', 'person')}
          {expandedSections.personalInfo && (
            <View style={styles.sectionContent}>
              {renderInfoRow('Contact Number', personalInfo.contactNumber)}
              {renderInfoRow('Address', [
                personalInfo.addressLine1,
                personalInfo.addressLine2,
                personalInfo.city,
                personalInfo.province,
                personalInfo.zipCode,
              ].filter(Boolean).join(', '))}
              {renderInfoRow('Employer', personalInfo.employerName)}
              {renderInfoRow('Position', personalInfo.position)}
              {renderInfoRow('Monthly Income', formatCurrency(personalInfo.monthlyIncome))}
              {renderInfoRow('Years Employed', personalInfo.yearsEmployed)}
              {renderInfoRow('Emergency Contact', personalInfo.emergencyContactName)}
              {renderInfoRow('Emergency Contact Number', personalInfo.emergencyContactNumber)}
            </View>
          )}
        </View>

        {/* Co-Makers Section */}
        {(loanType.required_comakers || 0) > 0 && (
          <View style={styles.section}>
            {renderSectionHeader(
              `Co-Makers (${coMakers.length}/${loanType.required_comakers})`,
              'coMakers',
              'people',
              coMakers.length >= (loanType.required_comakers || 0)
            )}
            {expandedSections.coMakers && (
              <View style={styles.sectionContent}>
                {coMakers.length > 0 ? (
                  coMakers.map((coMaker, index) => (
                    <View key={index} style={styles.coMakerItem}>
                      <View style={styles.coMakerNumber}>
                        <Text style={styles.coMakerNumberText}>{index + 1}</Text>
                      </View>
                      <View style={styles.coMakerDetails}>
                        <Text style={styles.coMakerName}>
                          {coMaker.full_name || coMaker.user_name || 'Co-maker'}
                        </Text>
                        <Text style={styles.coMakerContact}>
                          {coMaker.email || coMaker.user_email || ''}
                        </Text>
                        <View style={[
                          styles.coMakerStatus,
                          coMaker.status === 'approved' ? styles.statusApproved : styles.statusPending,
                        ]}>
                          <Text style={styles.coMakerStatusText}>
                            {coMaker.status === 'approved' ? 'Approved' : 'Pending Consent'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noDataText}>No co-makers added</Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Documents Section */}
        <View style={styles.section}>
          {renderSectionHeader(
            `Documents (${documentCount} uploaded)`,
            'documents',
            'folder',
            requiredUploadedCount >= REQUIRED_DOCUMENT_KEYS.length
          )}
          {expandedSections.documents && (
            <View style={styles.sectionContent}>
              {Object.entries(documents).map(([key, value]) => {
                if (!value || (Array.isArray(value) && value.length === 0)) return null;

                const label = key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

                return (
                  <View key={key} style={styles.documentItem}>
                    <Ionicons name="document-attach" size={20} color="#28a745" />
                    <Text style={styles.documentLabel}>{label}</Text>
                    <Ionicons name="checkmark-circle" size={20} color="#28a745" />
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Verification Status */}
        <View style={styles.verificationCard}>
          <Text style={styles.verificationTitle}>Verification Status</Text>
          <View style={styles.verificationItems}>
            <View style={styles.verificationItem}>
              <Ionicons
                name={state.faceVerification?.verified ? 'checkmark-circle' : 'close-circle'}
                size={24}
                color={state.faceVerification?.verified ? '#28a745' : '#dc3545'}
              />
              <Text style={styles.verificationLabel}>Face Verification</Text>
              <Text style={[styles.verificationStatus, { color: state.faceVerification?.verified ? '#28a745' : '#dc3545' }]}>
                {state.faceVerification?.verified ? 'Passed' : 'Failed'}
              </Text>
            </View>
            <View style={styles.verificationItem}>
              <Ionicons
                name={state.livenessCheck?.verified ? 'checkmark-circle' : 'close-circle'}
                size={24}
                color={state.livenessCheck?.verified ? '#28a745' : '#dc3545'}
              />
              <Text style={styles.verificationLabel}>Liveness Check</Text>
              <Text style={[styles.verificationStatus, { color: state.livenessCheck?.verified ? '#28a745' : '#dc3545' }]}>
                {state.livenessCheck?.verified ? 'Passed' : 'Failed'}
              </Text>
            </View>
          </View>
        </View>

        {/* Important Notice */}
        <View style={styles.noticeBox}>
          <Ionicons name="information-circle" size={24} color="#856404" />
          <View style={styles.noticeContent}>
            <Text style={styles.noticeTitle}>Before You Submit</Text>
            <Text style={styles.noticeText}>
              {'\u2022'} Ensure all information is accurate{'\n'}
              {'\u2022'} Your application will be reviewed by the Credit Committee{'\n'}
              {'\u2022'} You will be notified of the decision via the app{'\n'}
              {'\u2022'} Processing typically takes 3-5 business days
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Submit Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={20} color="#666" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.submitButtonText}>Submit Application</Text>
              <Ionicons name="send" size={20} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6c757d',
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e9ecef',
    borderRadius: 3,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#28a745',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#28a745',
    textAlign: 'center',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6c757d',
    lineHeight: 20,
    marginBottom: 20,
  },
  summaryCard: {
    backgroundColor: '#0d6efd',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  loanTypeIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  summaryHeaderText: {
    flex: 1,
  },
  loanTypeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  applicationId: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  summaryDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionIconComplete: {
    backgroundColor: '#d4edda',
  },
  sectionIconIncomplete: {
    backgroundColor: '#f8d7da',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6c757d',
  },
  infoValue: {
    fontSize: 14,
    color: '#212529',
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  infoValueImportant: {
    color: '#0d6efd',
    fontWeight: '600',
  },
  coMakerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  coMakerNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0d6efd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  coMakerNumberText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  coMakerDetails: {
    flex: 1,
  },
  coMakerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212529',
  },
  coMakerContact: {
    fontSize: 13,
    color: '#6c757d',
    marginTop: 2,
  },
  coMakerStatus: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 6,
  },
  statusApproved: {
    backgroundColor: '#d4edda',
  },
  statusPending: {
    backgroundColor: '#fff3cd',
  },
  coMakerStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#856404',
  },
  noDataText: {
    fontSize: 14,
    color: '#adb5bd',
    fontStyle: 'italic',
    paddingVertical: 12,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  documentLabel: {
    flex: 1,
    fontSize: 14,
    color: '#495057',
    marginLeft: 10,
  },
  verificationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  verificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 12,
  },
  verificationItems: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  verificationItem: {
    alignItems: 'center',
  },
  verificationLabel: {
    fontSize: 13,
    color: '#6c757d',
    marginTop: 6,
  },
  verificationStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  noticeBox: {
    flexDirection: 'row',
    backgroundColor: '#fff3cd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  noticeContent: {
    flex: 1,
    marginLeft: 12,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 8,
  },
  noticeText: {
    fontSize: 13,
    color: '#664d03',
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    marginRight: 12,
  },
  backButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28a745',
    paddingVertical: 14,
    borderRadius: 12,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
});

export default ReviewSubmitScreen;
