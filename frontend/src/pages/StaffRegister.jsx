import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/auth';
const VALID_ROLES = ['Bookkeeper', 'Treasurer', 'Credit Committee', 'Account Member Officer'];

export default function StaffRegister() {
  const { role: urlRole } = useParams();
  const role = VALID_ROLES.includes(urlRole) ? urlRole : '';

  // step: 'google' → show Google button | 'details' → show employee_id form | 'success'
  const [step, setStep] = useState('google');
  const [googleData, setGoogleData] = useState(null); // { access_token, firstname, lastname, email }
  const [employeeId, setEmployeeId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const googleAuth = useGoogleLogin({
    prompt: 'select_account',
    onSuccess: async (tokenResponse) => {
      setError('');
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const info = await res.json();
        setGoogleData({
          access_token: tokenResponse.access_token,
          firstname: info.given_name || '',
          lastname: info.family_name || '',
          email: info.email || '',
        });
        setStep('details');
      } catch {
        setError('Could not retrieve your Google account info. Please try again.');
      }
    },
    onError: () => setError('Google sign-in was cancelled or failed.'),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!role) {
      setError('Role not detected. Please go back and select your role from the Role Selection page.');
      return;
    }
    if (!employeeId.trim()) {
      setError('Employee ID is required.');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_URL}/staff/register/google/`, {
        access_token: googleData.access_token,
        role,
        employee_id: employeeId.trim(),
      });
      setStep('success');
    } catch (err) {
      const data = err.response?.data;
      setError(data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card" style={{ maxWidth: '480px' }}>
        <div className="login-header">
          <div className="logo">
            <span className="logo-icon">$</span>
            <span className="logo-text">eLoan</span>
          </div>
          <h1 className="login-title">Staff Registration</h1>
          <p className="login-subtitle">
            Registering as{' '}
            <span style={{ fontWeight: 700, color: '#17236a' }}>{role || 'Staff'}</span>
          </p>
        </div>

        {/* Step: success */}
        {step === 'success' && (
          <div style={{ padding: '1.5rem 0' }}>
            <div style={{
              background: '#d1fae5', color: '#065f46', padding: '1rem 1.25rem',
              borderRadius: '10px', fontSize: '0.9rem', marginBottom: '1.25rem', lineHeight: '1.6',
            }}>
              Registration submitted! Your account is pending Super Admin approval.
              You will be notified once approved.
            </div>
            <Link to="/" className="login-button" style={{ textAlign: 'center', display: 'block', textDecoration: 'none' }}>
              Back to Home
            </Link>
          </div>
        )}

        {/* Step: google — show Google sign-in button */}
        {step === 'google' && (
          <div className="login-form">
            {error && <div className="error-message">{error}</div>}
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.25rem', textAlign: 'center' }}>
              Use your Google account to register. Your name and email will be filled automatically.
            </p>
            <button
              type="button"
              className="google-button"
              onClick={() => { setError(''); googleAuth(); }}
            >
              <span className="google-icon">G</span>
              Continue with Google
            </button>
            <Link to="/" className="back-to-login" style={{ marginTop: '1.25rem' }}>
              ← Back to Role Selection
            </Link>
          </div>
        )}

        {/* Step: details — show locked Google info + employee ID input */}
        {step === 'details' && googleData && (
          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="error-message">{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>First Name</label>
                <input value={googleData.firstname} disabled style={{ opacity: 0.7 }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Last Name</label>
                <input value={googleData.lastname} disabled style={{ opacity: 0.7 }} />
              </div>
            </div>

            <div className="form-group">
              <label>Email</label>
              <input type="email" value={googleData.email} disabled style={{ opacity: 0.7 }} />
            </div>

            <div className="form-group">
              <label htmlFor="employee_id">Employee ID</label>
              <input
                id="employee_id"
                value={employeeId}
                onChange={(e) => { setEmployeeId(e.target.value); setError(''); }}
                required
                disabled={loading}
                placeholder="EMP-001"
              />
            </div>

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Submitting...' : 'Complete Registration'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('google'); setGoogleData(null); setError(''); }}
              style={{
                display: 'block', width: '100%', marginTop: '0.75rem', background: 'none',
                border: 'none', color: '#6b7280', fontSize: '0.875rem', cursor: 'pointer',
              }}
            >
              Use a different Google account
            </button>
          </form>
        )}

        <div className="login-footer">
          <p className="footer-text">eLoan Management System • Staff Access Only</p>
        </div>
      </div>
    </div>
  );
}
