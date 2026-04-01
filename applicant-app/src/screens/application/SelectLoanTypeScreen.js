/**
 * Select Loan Type Screen (Step 1)
 * Displays available loan types for selection
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApplication } from '../../context/ApplicationContext';
import applicationService from '../../services/applicationService';
import { getLoanTypeDraft, saveLoanTypeDraft } from '../../utils/applicationDraftStorage';

const STEP_TO_ROUTE = {
  2: 'PersonalDetails',
  3: 'LoanDetails',
  4: 'CoMaker',
  5: 'DocumentUpload',
  6: 'FaceVerification',
  7: 'ReviewSubmit',
};

const toPositiveNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const normalizeLoanTypeId = (value) => {
  if (value == null) return null;
  if (value?.nativeEvent) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

const mapCoMakers = (coMakers = []) =>
  coMakers.map((cm) => ({
    id: cm.id,
    user_id: cm.user_id,
    full_name: cm.full_name || cm.user_name || 'Co-maker',
    email: cm.user_email || cm.email || '',
    contact_number: cm.contact_number || '',
    status: cm.consent_given ? 'approved' : 'pending',
  }));

const inferResumeStep = ({
  hasLoanDetails,
  coMakerRequirement,
  coMakerCount,
  hasDocuments,
  hasVerification,
  localStep,
}) => {
  let inferredStep = 2;

  if (hasLoanDetails) {
    if (coMakerRequirement > 0 && coMakerCount < coMakerRequirement) {
      inferredStep = 4;
    } else if (!hasDocuments) {
      inferredStep = 5;
    } else if (!hasVerification) {
      inferredStep = 6;
    } else {
      inferredStep = 7;
    }
  } else if ((localStep || 0) >= 3) {
    inferredStep = 3;
  }

  const mergedStep = Math.max(inferredStep, localStep || 0, 2);
  if (mergedStep === 4 && coMakerRequirement === 0) {
    return 5;
  }
  return Math.min(7, mergedStep);
};

const getRouteFromStep = (step, coMakerRequirement) => {
  const normalized = step === 4 && coMakerRequirement === 0 ? 5 : step;
  return STEP_TO_ROUTE[normalized] || 'PersonalDetails';
};

const buildResumeState = (loanType, applicationDetail, localDraft, currentPersonalDetails) => {
  const amountFromServer = toPositiveNumber(applicationDetail.amount_requested);
  const totalPayableFromServer = toPositiveNumber(applicationDetail.total_payable);

  const serverLoanDetails = {
    amount: amountFromServer > 0 ? String(amountFromServer) : '',
    termMonths: amountFromServer > 0 ? String(applicationDetail.term_months || '') : '',
    purpose: amountFromServer > 0 ? (applicationDetail.purpose || '') : '',
    calculatedAmortization: toPositiveNumber(applicationDetail.monthly_amortization) > 0
      ? String(applicationDetail.monthly_amortization)
      : null,
    calculatedTotal: totalPayableFromServer > 0 ? String(applicationDetail.total_payable) : null,
    calculatedInterest:
      totalPayableFromServer > 0 && amountFromServer > 0
        ? (totalPayableFromServer - amountFromServer).toFixed(2)
        : null,
  };

  const mergedLoanDetails = {
    ...serverLoanDetails,
    ...(localDraft?.loanDetails || {}),
  };

  const coMakers = mapCoMakers(applicationDetail.comakers || []);
  const documents = mapDocumentsByType(applicationDetail.documents || []);
  const coMakerRequirement = loanType.required_comakers || 0;

  const hasLoanDetails = Boolean(
    toPositiveNumber(mergedLoanDetails.amount) > 0 &&
      parseInt(mergedLoanDetails.termMonths, 10) > 0 &&
      (mergedLoanDetails.purpose || '').trim()
  );

  const hasDocuments = (applicationDetail.documents || []).length > 0;
  const hasVerification = Boolean(
    applicationDetail.face_verification?.verified &&
      applicationDetail.liveness_check?.verified
  );
  const localStep = Number(localDraft?.currentStep) || 0;

  const currentStep = inferResumeStep({
    hasLoanDetails,
    coMakerRequirement,
    coMakerCount: coMakers.length,
    hasDocuments,
    hasVerification,
    localStep,
  });

  const stepValidation = {
    1: true,
    2: currentStep > 2 || hasLoanDetails,
    3: hasLoanDetails,
    4: coMakerRequirement > 0 ? coMakers.length >= coMakerRequirement : null,
    5: hasDocuments,
    6: hasVerification,
    7: false,
  };

  return {
    payload: {
      currentStep,
      personalDetails: {
        ...currentPersonalDetails,
        ...(localDraft?.personalDetails || {}),
      },
      loanDetails: mergedLoanDetails,
      coMakers,
      documents,
      faceVerification: {
        completed: Boolean(applicationDetail.face_verification?.completed),
        imageUri: null,
        verified: Boolean(applicationDetail.face_verification?.verified),
      },
      livenessCheck: {
        completed: Boolean(applicationDetail.liveness_check?.completed),
        method: null,
        verified: Boolean(applicationDetail.liveness_check?.verified),
      },
      stepValidation,
      errors: {},
    },
    currentStep,
  };
};

const LoanTypeCard = ({ loanType, selected, onSelect }) => (
  <TouchableOpacity
    style={[styles.loanCard, selected && styles.loanCardSelected]}
    onPress={onSelect}
  >
    <View style={styles.loanCardHeader}>
      <Text style={[styles.loanName, selected && styles.loanNameSelected]}>
        {loanType.loan_name}
      </Text>
      {loanType.required_comakers > 0 && (
        <View style={styles.comakerBadge}>
          <Text style={styles.comakerText}>
            {loanType.required_comakers} Co-maker{loanType.required_comakers > 1 ? 's' : ''}
          </Text>
        </View>
      )}
    </View>

    <Text style={styles.loanDescription} numberOfLines={2}>
      {loanType.description || 'Standard loan product'}
    </Text>

    <View style={styles.loanDetails}>
      <View style={styles.detailItem}>
        <Text style={styles.detailLabel}>Amount Range</Text>
        <Text style={styles.detailValue}>
          ₱{parseFloat(loanType.min_amount).toLocaleString()} - ₱{parseFloat(loanType.max_amount).toLocaleString()}
        </Text>
      </View>
      <View style={styles.detailItem}>
        <Text style={styles.detailLabel}>Interest Rate</Text>
        <Text style={styles.detailValue}>{loanType.interest_rate}% p.a.</Text>
      </View>
      <View style={styles.detailItem}>
        <Text style={styles.detailLabel}>Max Term</Text>
        <Text style={styles.detailValue}>{loanType.max_term_months} months</Text>
      </View>
    </View>

    {selected && (
      <View style={styles.selectedIndicator}>
        <Text style={styles.selectedText}>✓ Selected</Text>
      </View>
    )}
  </TouchableOpacity>
);

export default function SelectLoanTypeScreen({ navigation, route }) {
  const { state, setLoanType, dispatch } = useApplication();
  const [loanTypes, setLoanTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [resumeHandled, setResumeHandled] = useState(false);

  const resumeLoanTypeId = route?.params?.resumeLoanTypeId;
  const resumeApplicationId = route?.params?.resumeApplicationId;

  useEffect(() => {
    loadLoanTypes();
  }, []);

  useEffect(() => {
    if (state.loanType?.id) {
      setSelectedId(normalizeLoanTypeId(state.loanType.id));
    }
  }, [state.loanType]);

  const loadLoanTypes = async () => {
    try {
      const data = await applicationService.getLoanTypes();
      setLoanTypes(data);
    } catch (error) {
      console.error('Load loan types error:', error);
      Alert.alert('Error', 'Failed to load loan types');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (loanType) => {
    setSelectedId(normalizeLoanTypeId(loanType.id));
  };

  const handleContinue = async (overrideLoanTypeId = null, resumeId = null) => {
    const loanTypeId =
      normalizeLoanTypeId(overrideLoanTypeId) ?? normalizeLoanTypeId(selectedId);
    if (!loanTypeId) {
      Alert.alert('Selection Required', 'Please select a loan type to continue.');
      return;
    }

    const selectedLoanType = loanTypes.find(
      (lt) => normalizeLoanTypeId(lt.id) === loanTypeId
    );
    if (!selectedLoanType) return;

    setCreating(true);
    try {
      let existingDraft = null;
      if (resumeId) {
        existingDraft = { id: resumeId };
      } else {
        const allApplications = await applicationService.getApplications();
        existingDraft = allApplications.find(
          (app) =>
            ['Draft', 'Submitted'].includes(app.status) &&
            (app.loan_type_id === loanTypeId || app.loan_type === selectedLoanType.loan_name)
        );
      }

      if (existingDraft) {
        const detail = await applicationService.getApplication(existingDraft.id);
        const storedDraft = await getLoanTypeDraft(loanTypeId);
        const localDraft =
          storedDraft?.applicationId === existingDraft.id ? storedDraft : null;

        const { payload, currentStep } = buildResumeState(
          selectedLoanType,
          detail,
          localDraft,
          state.personalDetails
        );

        dispatch({ type: 'RESET' });
        setLoanType(selectedLoanType, selectedLoanType.required_comakers || 0);
        dispatch({ type: 'SET_APPLICATION_ID', payload: existingDraft.id });
        dispatch({ type: 'LOAD_APPLICATION', payload });

        await saveLoanTypeDraft(loanTypeId, {
          applicationId: existingDraft.id,
          currentStep,
          personalDetails: payload.personalDetails,
          loanDetails: payload.loanDetails,
        });

        // Always start from PersonalDetails so user can review their data
        // Data is pre-loaded, they just need to click Continue through each step
        navigation.navigate('PersonalDetails');
        return;
      }

      const result = await applicationService.createApplication(loanTypeId);

      dispatch({ type: 'RESET' });
      setLoanType(selectedLoanType, selectedLoanType.required_comakers || 0);
      dispatch({ type: 'SET_APPLICATION_ID', payload: result.id });
      dispatch({ type: 'SET_CURRENT_STEP', payload: 2 });

      await saveLoanTypeDraft(loanTypeId, {
        applicationId: result.id,
        currentStep: 2,
        personalDetails: {},
        loanDetails: {},
      });

      navigation.navigate('PersonalDetails');
    } catch (error) {
      console.error('Create application error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to create application');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (resumeHandled) return;
    if (!resumeLoanTypeId || loading) return;

    const selectedLoanType = loanTypes.find((lt) => lt.id === resumeLoanTypeId);
    if (!selectedLoanType) return;

    setSelectedId(normalizeLoanTypeId(resumeLoanTypeId));
    setResumeHandled(true);
    handleContinue(resumeLoanTypeId, resumeApplicationId);
  }, [resumeHandled, resumeLoanTypeId, resumeApplicationId, loading, loanTypes]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['bottom']}>
        <ActivityIndicator size="large" color="#17236a" />
        <Text style={styles.loadingText}>Loading loan types...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: '12.5%' }]} />
        </View>
        <Text style={styles.progressText}>Step 1 of 8</Text>
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionTitle}>Choose Your Loan Type</Text>
        <Text style={styles.instructionText}>
          Select the type of loan that best fits your needs
        </Text>
      </View>

      {/* Loan Types List */}
      <FlatList
        data={loanTypes}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <LoanTypeCard
            loanType={item}
            selected={selectedId === item.id}
            onSelect={() => handleSelect(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No loan types available</Text>
          </View>
        }
      />

      {/* Continue Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            (!selectedId || creating) && styles.continueButtonDisabled,
          ]}
          onPress={() => handleContinue()}
          disabled={!selectedId || creating}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.continueButtonText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
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
  instructions: {
    padding: 16,
    paddingTop: 8,
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
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  loanCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  loanCardSelected: {
    borderColor: '#17236a',
    backgroundColor: '#f5f3ff',
  },
  loanCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  loanName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  loanNameSelected: {
    color: '#17236a',
  },
  comakerBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  comakerText: {
    fontSize: 10,
    color: '#d97706',
    fontWeight: '500',
  },
  loanDescription: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },
  loanDetails: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 12,
    color: '#9ca3af',
  },
  detailValue: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  selectedIndicator: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#17236a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  selectedText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
  footer: {
    padding: 16,
    paddingTop: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  continueButton: {
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
