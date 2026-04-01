/**
 * My Applications Screen
 * Shows all loan applications for the user
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import applicationService from '../services/applicationService';
import { clearLoanTypeDraft } from '../utils/applicationDraftStorage';

const getStatusColor = (status) => {
  const colors = {
    'Draft': '#9ca3af',
    'Submitted': '#f59e0b',
    'Verified by Bookkeeper': '#3b82f6',
    'Pending Credit Committee': '#8b5cf6',
    'Approved by Credit Committee': '#10b981',
    'Approved \u2013 For Disbursement': '#7c3aed',
    'Active': '#059669',
    'Overdue': '#dc2626',
    'Completed': '#22c55e',
    'Rejected by Bookkeeper': '#ef4444',
    'Rejected by Treasurer': '#ef4444',
    'Rejected by Credit Committee': '#ef4444',
    'Disbursed': '#059669',
    'Paid': '#22c55e',
    'Closed': '#6b7280',
    'Withdrawn': '#6b7280',
  };
  return colors[status] || '#6b7280';
};

const ApplicationItem = ({ application, onPress, onResume, onDeleteDraft }) => (
  <TouchableOpacity style={styles.applicationCard} onPress={onPress}>
    <View style={styles.cardHeader}>
      <View>
        <Text style={styles.loanType}>{application.loan_type}</Text>
        <Text style={styles.applicationId}>Application #{application.id}</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(application.status) }]}>
        <Text style={styles.statusText}>{application.status}</Text>
      </View>
    </View>

    <View style={styles.cardBody}>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Amount</Text>
        <Text style={styles.detailValue}>
          ₱{parseFloat(application.amount_requested).toLocaleString()}
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Term</Text>
        <Text style={styles.detailValue}>{application.term_months} months</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Monthly</Text>
        <Text style={styles.detailValue}>
          ₱{parseFloat(application.monthly_amortization).toLocaleString()}
        </Text>
      </View>
    </View>

    <View style={styles.cardFooter}>
      <Text style={styles.dateText}>
        Applied: {new Date(application.application_date).toLocaleDateString()}
      </Text>
      {application.status === 'Disbursed' && (
        <Text style={styles.balanceText}>
          Balance: ₱{parseFloat(application.remaining_balance).toLocaleString()}
        </Text>
      )}
    </View>

    {application.status === 'Draft' && (
      <View style={styles.draftActions}>
        <TouchableOpacity style={styles.resumeButton} onPress={onResume}>
          <Text style={styles.draftActionText}>Resume</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={onDeleteDraft}>
          <Text style={styles.draftActionText}>Delete</Text>
        </TouchableOpacity>
      </View>
    )}
  </TouchableOpacity>
);

export default function MyApplicationsScreen({ navigation }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  const loadApplications = useCallback(async () => {
    try {
      const data = await applicationService.getApplications();
      setApplications(data);
    } catch (error) {
      console.error('Load applications error:', error);
      Alert.alert('Error', 'Failed to load applications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadApplications();
  }, [loadApplications]);

  const handleApplicationPress = (application) => {
    navigation.navigate('ApplicationDetail', { id: application.id });
  };

  const handleResumeDraft = (application) => {
    navigation.navigate('ApplicationWizard', {
      screen: 'SelectLoanType',
      params: {
        resumeLoanTypeId: application.loan_type_id,
        resumeApplicationId: application.id,
      },
    });
  };

  const handleDeleteDraft = (application) => {
    Alert.alert(
      'Delete Draft',
      'Are you sure you want to delete this draft? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await applicationService.deleteDraftApplication(application.id);
              if (application.loan_type_id) {
                await clearLoanTypeDraft(application.loan_type_id);
              }
              setApplications((prev) => prev.filter((app) => app.id !== application.id));
            } catch (error) {
              Alert.alert('Error', error.response?.data?.error || 'Failed to delete draft');
            }
          },
        },
      ]
    );
  };

  const filteredApplications = applications.filter((app) => {
    if (filter === 'all') return true;
    if (filter === 'active') {
      return ['Submitted', 'Verified by Bookkeeper', 'Pending Credit Committee', 'Approved by Credit Committee', 'Disbursed'].includes(app.status);
    }
    if (filter === 'completed') {
      return app.status === 'Paid';
    }
    if (filter === 'rejected') {
      return app.status.includes('Rejected');
    }
    return true;
  });

  const FilterButton = ({ label, value }) => (
    <TouchableOpacity
      style={[styles.filterButton, filter === value && styles.filterButtonActive]}
      onPress={() => setFilter(value)}
    >
      <Text style={[styles.filterButtonText, filter === value && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#17236a" />
        <Text style={styles.loadingText}>Loading applications...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Applications</Text>
        <Text style={styles.headerSubtitle}>{applications.length} total</Text>
      </View>

      {/* Filters */}
      <View style={styles.filterContainer}>
        <FilterButton label="All" value="all" />
        <FilterButton label="Active" value="active" />
        <FilterButton label="Completed" value="completed" />
        <FilterButton label="Rejected" value="rejected" />
      </View>

      {/* Applications List */}
      <FlatList
        data={filteredApplications}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <ApplicationItem
            application={item}
            onPress={() => handleApplicationPress(item)}
            onResume={() => handleResumeDraft(item)}
            onDeleteDraft={() => handleDeleteDraft(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#17236a']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📋</Text>
            <Text style={styles.emptyStateText}>No applications found</Text>
            <Text style={styles.emptyStateSubtext}>
              {filter !== 'all'
                ? 'Try changing the filter'
                : 'Start by applying for a loan'}
            </Text>
          </View>
        }
      />
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
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterButtonActive: {
    backgroundColor: '#17236a',
    borderColor: '#17236a',
  },
  filterButtonText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  applicationCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  loanType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  applicationId: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    maxWidth: 130,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
  cardBody: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 13,
    color: '#1f2937',
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
  },
  draftActions: {
    flexDirection: 'row',
    marginTop: 12,
  },
  resumeButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 8,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#6b7280',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  draftActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  balanceText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
  },
});

