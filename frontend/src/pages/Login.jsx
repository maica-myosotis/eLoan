import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import authService from '../services/auth.service';
import PasswordInput from '../components/PasswordInput';
import '../styles/Login.css';

function Login() {
  const navigate = useNavigate();
  const { role: urlRole } = useParams();

  const displayRole = urlRole === 'admin' ? 'Super Administrator' : urlRole;
  const pageTitle = displayRole ? `${displayRole} Login` : 'Staff Login';
  const pageSubtitle = displayRole ? `Sign in to ${displayRole} Portal` : 'Sign in to your account';

  const getRoleName = () => {
    const roleMap = {
      'admin': 'Super Administrator',
      'Super Administrator': 'Super Administrator',
      'Bookkeeper': 'Bookkeeper',
      'Treasurer': 'Treasurer',
      'Credit Committee': 'Credit Committee',
      'Account Member Officer': 'Account Member Officer',
    };
    return roleMap[urlRole] || urlRole || '';
  };

  const [formData, setFormData] = useState({ email: '', password: '', role: getRoleName() });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const redirectByRole = (role) => {
    switch (role) {
      case 'Bookkeeper': navigate('/bookkeeper/dashboard'); break;
      case 'Treasurer': navigate('/treasurer/dashboard'); break;
      case 'Credit Committee': navigate('/credit-committee/dashboard'); break;
      case 'Account Member Officer': navigate('/amo/dashboard'); break;
      case 'Super Administrator': navigate('/superadmin/dashboard'); break;
      default: navigate('/dashboard');
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.role) { setError('Please select your role.'); return; }
    setLoading(true);
    try {
      const response = await authService.login(formData.email, formData.password, formData.role);
      redirectByRole(response.user.role);
    } catch (err) {
      if (err.response?.data?.error) setError(err.response.data.error);
      else if (err.response?.data?.non_field_errors) setError(err.response.data.non_field_errors[0]);
      else setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (tokenResponse) => {
    setError('');
    try {
      const response = await authService.googleLogin(tokenResponse.access_token, formData.role);
      redirectByRole(response.user.role);
    } catch (err) {
      setError(err.response?.data?.error || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => { setGoogleLoading(false); setError('Google sign-in was cancelled or failed.'); },
    prompt: 'select_account',
  });

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="logo">
            <span className="logo-icon">$</span>
            <span className="logo-text">eLoan</span>
          </div>
          <h1 className="login-title">{pageTitle}</h1>
          <p className="login-subtitle">{pageSubtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email" id="email" name="email"
              value={formData.email} onChange={handleChange}
              placeholder="you@company.com" required disabled={loading || googleLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <PasswordInput
              id="password" name="password"
              value={formData.password} onChange={handleChange}
              placeholder="••••••••" required disabled={loading || googleLoading}
            />
          </div>

          <div className="form-footer">
            <Link to="/forgot-password" className="forgot-link">Forgot Password?</Link>
          </div>

          <button type="submit" className="login-button" disabled={loading || googleLoading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>

          <div className="auth-divider">
            <span className="auth-divider-line" />
            <span className="auth-divider-text">or</span>
            <span className="auth-divider-line" />
          </div>

          <button
            type="button"
            className="google-button"
            onClick={() => { setError(''); setGoogleLoading(true); googleLogin(); }}
            disabled={loading || googleLoading}
          >
            <span className="google-icon">G</span>
            {googleLoading ? 'Signing in...' : 'Sign in with Google'}
          </button>

          <Link to="/" className="back-to-login">← Back to Role Selection</Link>

          {urlRole !== 'admin' && urlRole !== 'Super Administrator' && (
            <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
              Don't have an account?{' '}
              <Link
                to={urlRole ? `/staff/register/${urlRole}` : '/staff/register'}
                style={{ color: '#17236a', fontWeight: 600, textDecoration: 'none' }}
              >
                Register here
              </Link>
            </p>
          )}
        </form>

        <div className="login-footer">
          <p className="footer-text">eLoan Management System • Staff Access Only</p>
        </div>
      </div>
    </div>
  );
}

export default Login;
