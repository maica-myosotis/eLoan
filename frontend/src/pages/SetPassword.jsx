import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import authService from '../services/auth.service';
import PasswordInput from '../components/PasswordInput';
import '../styles/Login.css';

function SetPassword() {
  const { uid, token } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    validateToken();
  }, [uid, token]);

  const validateToken = async () => {
    try {
      const response = await authService.validateToken(uid, token);
      if (response.valid) {
        setTokenValid(true);
        setUserInfo({
          email: response.email,
          firstname: response.firstname,
          lastname: response.lastname
        });
      } else {
        setTokenValid(false);
        setError(response.message || 'This link is invalid or has expired.');
      }
    } catch (err) {
      setTokenValid(false);
      setError('This link is invalid or has expired.');
    } finally {
      setValidating(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (formData.newPassword !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    // Validate password length
    if (formData.newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);

    try {
      await authService.setPassword(
        uid,
        token,
        formData.newPassword,
        formData.confirmPassword
      );
      setSuccess(true);

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err) {
      if (err.response?.data) {
        // Handle field-specific errors
        if (err.response.data.new_password) {
          setError(err.response.data.new_password[0]);
        } else if (err.response.data.confirm_password) {
          setError(err.response.data.confirm_password[0]);
        } else if (err.response.data.token) {
          setError('This link has expired. Please request a new password reset.');
        } else {
          setError('Failed to set password. Please try again.');
        }
      } else {
        setError('Unable to connect to server. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Validating link...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="logo">
              <span className="logo-icon">$</span>
              <span className="logo-text">eLoan</span>
            </div>
            <h1 className="login-title">Invalid Link</h1>
          </div>

          <div className="error-container">
            <div className="error-icon">✕</div>
            <p className="error-message">{error}</p>
            <Link to="/forgot-password" className="link-button">
              Request New Link
            </Link>
            <Link to="/login" className="back-to-login">
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="logo">
              <span className="logo-icon">$</span>
              <span className="logo-text">eLoan</span>
            </div>
            <h1 className="login-title">Password Set Successfully!</h1>
          </div>

          <div className="success-container">
            <div className="success-icon">✓</div>
            <div className="success-message">
              <p>Your password has been set successfully.</p>
              <p className="success-note">
                Redirecting to login page...
              </p>
            </div>
            <Link to="/login" className="back-to-login">
              Go to Login Now
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="logo">
            <span className="logo-icon">$</span>
            <span className="logo-text">eLoan</span>
          </div>
          <h1 className="login-title">Set Your Password</h1>
          {userInfo && (
            <p className="login-subtitle">
              Welcome, {userInfo.firstname} {userInfo.lastname}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <PasswordInput
              id="newPassword"
              name="newPassword"
              value={formData.newPassword}
              onChange={handleChange}
              placeholder="••••••••"
              required
              disabled={loading}
              minLength={8}
            />
            <small className="form-hint">Minimum 8 characters</small>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="••••••••"
              required
              disabled={loading}
              minLength={8}
            />
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Setting Password...' : 'Set Password'}
          </button>
        </form>

        <div className="login-footer">
          <p className="footer-text">
            eLoan Management System • Staff Access Only
          </p>
        </div>
      </div>
    </div>
  );
}

export default SetPassword;
