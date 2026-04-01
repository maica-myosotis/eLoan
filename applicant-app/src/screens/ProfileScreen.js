/**
 * Profile Screen
 * User profile management
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import profileService from '../services/profileService';

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [profile, setProfile] = useState(null);
  const [membership, setMembership] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Editable fields
  const [contactNumber, setContactNumber] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [employerName, setEmployerName] = useState('');
  const [position, setPosition] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await profileService.getProfile();
      setProfile(data.profile);
      setMembership(data.membership || null);
      // Set editable fields
      setContactNumber(data.profile.contact_number || '');
      setAddressLine1(data.profile.address_line1 || '');
      setCity(data.profile.city || '');
      setProvince(data.profile.province || '');
      setEmployerName(data.profile.employer_name || '');
      setPosition(data.profile.position || '');
    } catch (error) {
      console.error('Load profile error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await profileService.updateProfile({
        contact_number: contactNumber,
        address_line1: addressLine1,
        city: city,
        province: province,
        employer_name: employerName,
        position: position,
      });
      Alert.alert('Success', 'Profile updated successfully');
      setIsEditing(false);
      loadProfile();
    } catch (error) {
      console.error('Save profile error:', error);
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            await logout();
          },
        },
      ]
    );
  };

  const handleChangePassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowChangePassword(true);
  };

  const handleSubmitChangePassword = async () => {
    if (!currentPassword) {
      Alert.alert('Error', 'Current password is required');
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      Alert.alert('Error', 'New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setChangingPassword(true);
    try {
      await profileService.changePassword(
        currentPassword,
        newPassword,
        confirmPassword
      );
      setShowChangePassword(false);
      Alert.alert('Success', 'Password changed successfully');
    } catch (error) {
      Alert.alert(
        'Error',
        error.response?.data?.error || 'Failed to change password'
      );
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#17236a" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          {!isEditing ? (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setIsEditing(true)}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setIsEditing(false);
                loadProfile();
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* User Info Card */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.firstname?.[0]?.toUpperCase() || 'U'}
            </Text>
          </View>
          <Text style={styles.userName}>
            {user?.firstname} {user?.lastname}
          </Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>Applicant</Text>
          </View>
        </View>

        {/* Membership */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Membership</Text>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Membership Type</Text>
            <View style={styles.membershipTypeRow}>
              {membership?.membership_type ? (
                <View style={[
                  styles.membershipBadge,
                  membership.membership_type === 'regular'
                    ? styles.membershipBadgeRegular
                    : styles.membershipBadgeAssociate,
                ]}>
                  <Text style={[
                    styles.membershipBadgeText,
                    membership.membership_type === 'regular'
                      ? styles.membershipBadgeTextRegular
                      : styles.membershipBadgeTextAssociate,
                  ]}>
                    {membership.membership_type === 'regular' ? 'Regular Member' : 'Associate Member'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.fieldValue}>Pending AMO review</Text>
              )}
            </View>
          </View>
          <View style={styles.fieldRow}>
            <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.fieldLabel}>Subscribed Shares</Text>
              <Text style={styles.fieldValue}>
                {membership?.subscribed_shares != null
                  ? `${membership.subscribed_shares} shares`
                  : 'Not yet recorded'}
              </Text>
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Paid-Up Shares</Text>
              <Text style={styles.fieldValue}>
                {membership?.paid_shares != null
                  ? `${membership.paid_shares} shares`
                  : 'Not yet recorded'}
              </Text>
            </View>
          </View>
          {membership?.member_since && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Member Since</Text>
              <Text style={styles.fieldValue}>
                {new Date(membership.member_since).toLocaleDateString('en-PH', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </Text>
            </View>
          )}
          <View style={styles.membershipNote}>
            <Text style={styles.membershipNoteText}>
              Regular membership requires a fixed deposit of at least ₱20,000 and permanent/casual/temporary employment status. Minimum subscription: 20 shares, paid-up: 5 shares.
            </Text>
          </View>
        </View>

        {/* Contact Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Phone Number</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={contactNumber}
                onChangeText={setContactNumber}
                placeholder="Enter phone number"
                keyboardType="phone-pad"
              />
            ) : (
              <Text style={styles.fieldValue}>{contactNumber || 'Not provided'}</Text>
            )}
          </View>
        </View>

        {/* Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Address</Text>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Street Address</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={addressLine1}
                onChangeText={setAddressLine1}
                placeholder="Enter street address"
              />
            ) : (
              <Text style={styles.fieldValue}>{addressLine1 || 'Not provided'}</Text>
            )}
          </View>
          <View style={styles.fieldRow}>
            <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.fieldLabel}>City</Text>
              {isEditing ? (
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                />
              ) : (
                <Text style={styles.fieldValue}>{city || '-'}</Text>
              )}
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Province</Text>
              {isEditing ? (
                <TextInput
                  style={styles.input}
                  value={province}
                  onChangeText={setProvince}
                  placeholder="Province"
                />
              ) : (
                <Text style={styles.fieldValue}>{province || '-'}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Employment */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Employment</Text>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Employer</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={employerName}
                onChangeText={setEmployerName}
                placeholder="Enter employer name"
              />
            ) : (
              <Text style={styles.fieldValue}>{employerName || 'Not provided'}</Text>
            )}
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Position</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={position}
                onChangeText={setPosition}
                placeholder="Enter position"
              />
            ) : (
              <Text style={styles.fieldValue}>{position || 'Not provided'}</Text>
            )}
          </View>
        </View>

        {/* Save Button (when editing) */}
        {isEditing && (
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSaveProfile}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <TouchableOpacity style={styles.menuItem} onPress={handleChangePassword}>
            <Text style={styles.menuItemText}>Change Password</Text>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={[styles.logoutButton, loggingOut && styles.logoutButtonDisabled]}
          onPress={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.logoutButtonText}>Logout</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.versionText}>eLoan Applicant v1.0.0</Text>
      </ScrollView>

      <Modal
        visible={showChangePassword}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChangePassword(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change Password</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Current password"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="New password (min 8 chars)"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Confirm new password"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowChangePassword(false)}
                disabled={changingPassword}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmit,
                  changingPassword && styles.modalSubmitDisabled,
                ]}
                onPress={handleSubmitChangePassword}
                disabled={changingPassword}
              >
                {changingPassword ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Update</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#17236a',
    borderRadius: 8,
  },
  editButtonText: {
    color: '#fff',
    fontWeight: '500',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  cancelButtonText: {
    color: '#6b7280',
    fontWeight: '500',
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#17236a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '600',
    color: '#fff',
  },
  userName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
  },
  userEmail: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  roleBadge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#ede9fe',
    borderRadius: 12,
  },
  roleText: {
    fontSize: 12,
    color: '#17236a',
    fontWeight: '500',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  field: {
    marginBottom: 16,
  },
  fieldRow: {
    flexDirection: 'row',
  },
  fieldLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 6,
  },
  fieldValue: {
    fontSize: 15,
    color: '#1f2937',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1f2937',
    backgroundColor: '#f9fafb',
  },
  saveButton: {
    backgroundColor: '#17236a',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  saveButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  membershipTypeRow: {
    flexDirection: 'row',
  },
  membershipBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  membershipBadgeRegular: {
    backgroundColor: '#d1fae5',
  },
  membershipBadgeAssociate: {
    backgroundColor: '#e0e7ff',
  },
  membershipBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  membershipBadgeTextRegular: {
    color: '#065f46',
  },
  membershipBadgeTextAssociate: {
    color: '#3730a3',
  },
  membershipNote: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  membershipNoteText: {
    fontSize: 12,
    color: '#0369a1',
    lineHeight: 18,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  menuItemText: {
    fontSize: 15,
    color: '#1f2937',
  },
  menuItemArrow: {
    fontSize: 20,
    color: '#9ca3af',
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  versionText: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 24,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginBottom: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  modalCancelText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '600',
  },
  modalSubmit: {
    backgroundColor: '#17236a',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalSubmitDisabled: {
    backgroundColor: '#9ca3af',
  },
  modalSubmitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
