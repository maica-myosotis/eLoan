import { useState, useEffect } from 'react';
import amoService from '../../services/amo.service';
import PasswordInput from '../../components/PasswordInput';

export default function AMOSettings() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ firstname: '', lastname: '' });
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [profileMsg, setProfileMsg] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  useEffect(() => {
    amoService.getProfile().then(d => {
      setProfile(d);
      setForm({ firstname: d.firstname, lastname: d.lastname });
    });
  }, []);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    try {
      await amoService.updateProfile(form);
      setProfileMsg('Profile updated successfully.');
      setProfile(prev => ({ ...prev, ...form }));
    } catch {
      setProfileMsg('Failed to update profile.');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwMsg('New passwords do not match.');
      return;
    }
    try {
      await amoService.changePassword({ current_password: pwForm.current_password, new_password: pwForm.new_password });
      setPwMsg('Password changed successfully.');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (e) {
      setPwMsg(e?.response?.data?.error || 'Failed to change password.');
    }
  };

  if (!profile) return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;

  return (
    <div style={{ maxWidth: '640px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.25rem' }}>Settings</h1>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>Manage your account settings</p>

      {/* Profile Card */}
      <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{
            width: '60px', height: '60px', background: '#10b981', color: '#fff',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.25rem', fontWeight: 700,
          }}>
            {profile.firstname?.[0]}{profile.lastname?.[0]}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1f2937' }}>{profile.firstname} {profile.lastname}</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{profile.email}</div>
            <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>Account Member Officer</div>
          </div>
        </div>

        {profileMsg && (
          <div style={{ background: '#d1fae5', color: '#065f46', padding: '0.625rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {profileMsg}
          </div>
        )}

        <form onSubmit={handleProfileSave}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1f2937', marginBottom: '1rem' }}>Edit Profile</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>First Name</label>
              <input value={form.firstname} onChange={e => setForm({ ...form, firstname: e.target.value })} style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>Last Name</label>
              <input value={form.lastname} onChange={e => setForm({ ...form, lastname: e.target.value })} style={inputStyle} required />
            </div>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Email</label>
            <input value={profile.email} disabled style={{ ...inputStyle, background: '#f9fafb', color: '#9ca3af' }} />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={labelStyle}>Employee ID</label>
            <input value={profile.employee_id || ''} disabled style={{ ...inputStyle, background: '#f9fafb', color: '#9ca3af' }} />
          </div>
          <button type="submit" style={{ background: '#10b981', color: '#fff', border: 'none', padding: '0.625rem 1.5rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
            Save Changes
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1f2937', marginBottom: '1rem' }}>Change Password</h3>

        {pwMsg && (
          <div style={{ background: pwMsg.includes('success') ? '#d1fae5' : '#fee2e2', color: pwMsg.includes('success') ? '#065f46' : '#991b1b', padding: '0.625rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {pwMsg}
          </div>
        )}

        <form onSubmit={handlePasswordChange}>
          {[['Current Password', 'current_password'], ['New Password', 'new_password'], ['Confirm New Password', 'confirm_password']].map(([label, key]) => (
            <div key={key} style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>{label}</label>
              <PasswordInput
                value={pwForm[key]}
                onChange={e => setPwForm({ ...pwForm, [key]: e.target.value })}
                style={inputStyle}
                required
              />
            </div>
          ))}
          <button type="submit" style={{ background: '#1f2937', color: '#fff', border: 'none', padding: '0.625rem 1.5rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
            Update Password
          </button>
        </form>
      </div>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: 500, color: '#374151', marginBottom: '0.4rem' };
const inputStyle = { width: '100%', padding: '0.625rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box' };