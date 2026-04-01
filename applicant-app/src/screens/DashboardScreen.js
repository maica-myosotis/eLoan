/**
 * Dashboard Screen
 * Main home screen showing loan stats and recent applications
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import dashboardService from '../services/dashboardService';

// Stats Card Component
const StatsCard = ({ title, value, icon, color = '#17236a' }) => (
  <View style={[styles.statsCard, { borderLeftColor: color }]}>
    <Text style={styles.statsIcon}>{icon}</Text>
    <Text style={styles.statsValue}>{value}</Text>
    <Text style={styles.statsTitle}>{title}</Text>
  </View>
);

// Recent Application Card Component
const ApplicationCard = ({ application, onPress }) => {
  const getStatusColor = (status) => {
    const colors = {
      'Draft': '#9ca3af',
      'Submitted': '#f59e0b',
      'Verified by Bookkeeper': '#3b82f6',
      'Pending Credit Committee': '#8b5cf6',
      'Approved by Credit Committee': '#10b981',
      'Rejected by Bookkeeper': '#ef4444',
      'Rejected by Credit Committee': '#ef4444',
      'Disbursed': '#059669',
      'Paid': '#22c55e',
    };
    return colors[status] || '#6b7280';
  };

  return (
    <TouchableOpacity style={styles.applicationCard} onPress={onPress}>
      <View style={styles.applicationHeader}>
        <Text style={styles.applicationLoanType}>{application.loan_type}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(application.status) }]}>
          <Text style={styles.statusText} numberOfLines={1}>{application.status}</Text>
        </View>
      </View>
      <View style={styles.applicationDetails}>
        <Text style={styles.applicationAmount}>
          ₱{parseFloat(application.amount_requested).toLocaleString()}
        </Text>
        <Text style={styles.applicationDate}>
          {new Date(application.application_date).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

// Notification Preview Card Component
const NotificationCard = ({ notification }) => (
  <View style={styles.notificationCard}>
    <Text style={styles.notificationTitle}>{notification.title}</Text>
    <Text style={styles.notificationMessage} numberOfLines={2}>
      {notification.message}
    </Text>
    <Text style={styles.notificationTime}>
      {new Date(notification.created_at).toLocaleDateString()}
    </Text>
  </View>
);

export default function DashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [recentApplications, setRecentApplications] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [canApply, setCanApply] = useState({ can_apply: false, reason: '' });

  const loadDashboard = useCallback(async () => {
    try {
      const [dashboardData, canApplyResult] = await Promise.all([
        dashboardService.getDashboard(),
        dashboardService.checkCanApply(),
      ]);

      setStats(dashboardData.stats);
      setRecentApplications(dashboardData.recent_applications || []);
      setNotifications(dashboardData.notifications || []);
      setCanApply(canApplyResult);
    } catch (error) {
      console.error('Dashboard load error:', error);
      if (error.response?.status === 401) {
        // Token expired, logout
        await logout();
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [logout]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDashboard();
  }, [loadDashboard]);

  const handleApplyPress = () => {
    if (canApply.can_apply) {
      navigation.navigate('ApplicationWizard');
      return;
    }

    const hasEditableApplication = recentApplications.some((app) =>
      ['Draft', 'Submitted'].includes(app.status)
    );

    if (hasEditableApplication) {
      navigation.navigate('ApplicationWizard');
      return;
    }

    Alert.alert('Cannot Apply', canApply.reason);
  };

  const handleApplicationPress = (application) => {
    navigation.navigate('ApplicationDetail', { id: application.id });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#17236a" />
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#17236a']} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.firstname || 'Applicant'}</Text>
          </View>
          <View style={styles.logoContainer}>
            <Text style={styles.logoIcon}>💰</Text>
            <Text style={styles.logoText}>eLoan</Text>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <StatsCard
            title="Total Apps"
            value={stats?.total_applications || 0}
            icon="📋"
            color="#17236a"
          />
          <StatsCard
            title="Active Loans"
            value={stats?.approved_loans || 0}
            icon="✅"
            color="#10b981"
          />
          <StatsCard
            title="Pending"
            value={stats?.pending_applications || 0}
            icon="⏳"
            color="#f59e0b"
          />
          <StatsCard
            title="Total Paid"
            value={`₱${parseFloat(stats?.total_paid || 0).toLocaleString()}`}
            icon="💰"
            color="#059669"
          />
        </View>

        {/* Apply Button */}
        <TouchableOpacity
          style={[
            styles.applyButton,
            !canApply.can_apply && styles.applyButtonDisabled,
          ]}
          onPress={handleApplyPress}
        >
          <Text style={styles.applyButtonText}>
            {canApply.can_apply ? '+ Apply for a Loan' : 'Cannot Apply'}
          </Text>
          {!canApply.can_apply && (
            <Text style={styles.applyButtonSubtext}>{canApply.reason}</Text>
          )}
        </TouchableOpacity>

        {/* Recent Applications */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Applications</Text>
            {recentApplications.length > 0 && (
              <TouchableOpacity onPress={() => navigation.navigate('MyApplications')}>
                <Text style={styles.seeAllLink}>See All</Text>
              </TouchableOpacity>
            )}
          </View>
          {recentApplications.length > 0 ? (
            recentApplications.map((app) => (
              <ApplicationCard
                key={app.id}
                application={app}
                onPress={() => handleApplicationPress(app)}
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>📄</Text>
              <Text style={styles.emptyStateText}>No applications yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Start your first loan application today!
              </Text>
            </View>
          )}
        </View>

        {/* Notifications Preview */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Notifications</Text>
            {notifications.length > 0 && (
              <TouchableOpacity onPress={() => navigation.navigate('Notifications')}>
                <Text style={styles.seeAllLink}>See All</Text>
              </TouchableOpacity>
            )}
          </View>
          {notifications.length > 0 ? (
            notifications.slice(0, 3).map((notif) => (
              <NotificationCard key={notif.id} notification={notif} />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>🔔</Text>
              <Text style={styles.emptyStateText}>No notifications</Text>
            </View>
          )}
        </View>
      </ScrollView>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 14,
    color: '#6b7280',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoIcon: {
    fontSize: 24,
    marginRight: 4,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#17236a',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statsCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statsIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  statsValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  statsTitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  applyButton: {
    backgroundColor: '#17236a',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#17236a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  applyButtonDisabled: {
    backgroundColor: '#9ca3af',
    shadowColor: '#9ca3af',
  },
  applyButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  applyButtonSubtext: {
    color: '#e5e7eb',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  seeAllLink: {
    color: '#17236a',
    fontSize: 14,
    fontWeight: '500',
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
  applicationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  applicationLoanType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    maxWidth: 140,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
  applicationDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  applicationAmount: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  applicationDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  notificationCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#17236a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 11,
    color: '#9ca3af',
  },
  emptyState: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  emptyStateIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  emptyStateSubtext: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
    textAlign: 'center',
  },
});
