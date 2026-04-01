import { useState, useEffect } from 'react';
import creditCommitteeService from '../../services/creditCommittee.service';
import PasswordInput from '../../components/PasswordInput';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [preferences, setPreferences] = useState(null);

  // Form states
  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchProfile();
    fetchPreferences();
  }, []);

  const fetchProfile = async () => {
    try {
      const result = await creditCommitteeService.getProfile();
      setProfile(result.profile);
      setFirstname(result.profile.firstname);
      setLastname(result.profile.lastname);
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPreferences = async () => {
    try {
      const result = await creditCommitteeService.getNotificationPreferences();
      setPreferences(result.preferences);
    } catch (err) {
      console.error('Failed to load preferences:', err);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await creditCommitteeService.updateProfile({ firstname, lastname });
      setMessage({ type: 'success', text: 'Profile updated successfully' });
      fetchProfile();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to update profile' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    try {
      setSubmitting(true);
      await creditCommitteeService.changePassword(oldPassword, newPassword, confirmPassword);
      setMessage({ type: 'success', text: 'Password changed successfully' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to change password' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePreferences = async (key, value) => {
    try {
      await creditCommitteeService.updateNotificationPreferences({ [key]: value });
      setPreferences(prev => ({ ...prev, [key]: value }));
    } catch (err) {
      console.error('Failed to update preferences:', err);
    }
  };

  const handleLogoutEverywhere = async () => {
    if (!confirm('Are you sure you want to logout from all devices?')) return;
    try {
      await creditCommitteeService.logoutEverywhere();
      alert('Successfully logged out from all devices. You will be redirected to login.');
      window.location.href = '/';
    } catch (err) {
      alert('Failed to logout from all devices');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>Loading...</div>
      </div>
    );
  }

  const tabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'password', label: 'Change Password' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'security', label: 'Security' },
  ];

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937', marginBottom: '1.5rem' }}>
        Settings
      </h1>

      {/* Message */}
      {message.text && (
        <div style={{
          padding: '1rem',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          background: message.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: message.type === 'success' ? '#065f46' : '#991b1b',
        }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1.5rem' }}>
        {/* Sidebar Tabs */}
        <div style={{
          width: '200px',
          background: '#fff',
          borderRadius: '0.75rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          padding: '0.5rem',
          height: 'fit-content',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setMessage({ type: '', text: '' }); }}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                textAlign: 'left',
                border: 'none',
                borderRadius: '0.5rem',
                background: activeTab === tab.id ? '#8b5cf6' : 'transparent',
                color: activeTab === tab.id ? '#fff' : '#374151',
                cursor: 'pointer',
                fontWeight: 500,
                marginBottom: '0.25rem',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          background: '#fff',
          borderRadius: '0.75rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          padding: '1.5rem',
        }}>
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem' }}>Profile Information</h2>
              <form onSubmit={handleUpdateProfile}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Email</label>
                  <input
                    type="email"
                    value={profile?.email || ''}
                    disabled
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                      background: '#f9fafb',
                      color: '#6b7280',
                    }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>First Name</label>
                    <input
                      type="text"
                      value={firstname}
                      onChange={(e) => setFirstname(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #d1d5db',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Last Name</label>
                    <input
                      type="text"
                      value={lastname}
                      onChange={(e) => setLastname(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #d1d5db',
                      }}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    background: '#8b5cf6',
                    color: '#fff',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            </div>
          )}

          {/* Password Tab */}
          {activeTab === 'password' && (
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem' }}>Change Password</h2>
              <form onSubmit={handleChangePassword}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Current Password</label>
                  <PasswordInput
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>New Password</label>
                  <PasswordInput
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Confirm New Password</label>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    background: '#8b5cf6',
                    color: '#fff',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {submitting ? 'Changing...' : 'Change Password'}
                </button>
              </form>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && preferences && (
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem' }}>Notification Preferences</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb',
                }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>Email Notifications</div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Receive notifications via email</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.email_notifications}
                    onChange={(e) => handleUpdatePreferences('email_notifications', e.target.checked)}
                    style={{ width: '20px', height: '20px' }}
                  />
                </label>
                <label style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb',
                }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>In-App Notifications</div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Receive notifications in the application</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.in_app_notifications}
                    onChange={(e) => handleUpdatePreferences('in_app_notifications', e.target.checked)}
                    style={{ width: '20px', height: '20px' }}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem' }}>Security Settings</h2>
              <div style={{
                padding: '1.5rem',
                borderRadius: '0.5rem',
                border: '1px solid #e5e7eb',
                marginBottom: '1rem',
              }}>
                <h3 style={{ fontWeight: 500, marginBottom: '0.5rem' }}>Logout from All Devices</h3>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  This will invalidate all active sessions and log you out from all devices.
                </p>
                <button
                  onClick={handleLogoutEverywhere}
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Logout Everywhere
                </button>
              </div>
              <div style={{ padding: '1rem', background: '#fef3c7', borderRadius: '0.5rem' }}>
                <div style={{ fontWeight: 500, color: '#92400e', marginBottom: '0.25rem' }}>
                  &#9888; Account Information
                </div>
                <div style={{ fontSize: '0.875rem', color: '#78350f' }}>
                  Member since: {profile?.date_joined ? new Date(profile.date_joined).toLocaleDateString() : 'N/A'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
