import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import authService from '../services/auth.service';
import PasswordInput from '../components/PasswordInput';

export default function SuperAdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.superAdminLogin(email, password);
      navigate('/superadmin/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (tokenResponse) => {
    setError('');
    try {
      const response = await authService.googleLogin(tokenResponse.access_token);
      if (response.user?.role === 'Super Administrator') {
        navigate('/superadmin/dashboard');
      } else {
        authService.logout();
        setError('Access denied. This portal is for superadmins only.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Google sign-in failed.');
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
    <div style={styles.page}>
      {/* Left panel — branding */}
      <div style={styles.left}>
        <div style={styles.brand}>
          <div style={styles.logoBox}>
            <span style={styles.logoSymbol}>$</span>
          </div>
          <span style={styles.logoText}>eLoan</span>
        </div>
        <h2 style={styles.tagline}>System Administration</h2>
        <p style={styles.taglineSub}>
          Restricted access portal. Authorized superusers only.
        </p>
        <div style={styles.badge}>
          <span style={styles.badgeIcon}>⚙</span>
          <span style={styles.badgeText}>Superuser Console</span>
        </div>
      </div>

      {/* Right panel — login form */}
      <div style={styles.right}>
        <div style={styles.card}>
          <h1 style={styles.title}>Administrator Sign In</h1>
          <p style={styles.subtitle}>Enter your superuser credentials to continue</p>

          {error && (
            <div style={styles.error}>{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={styles.field}>
              <label style={styles.label}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="admin@example.com"
                required
                disabled={loading || googleLoading}
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Password</label>
              <PasswordInput
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                required
                disabled={loading || googleLoading}
                style={styles.input}
              />
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              style={{ ...styles.btn, opacity: (loading || googleLoading) ? 0.7 : 1 }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div style={styles.divider}>
            <span style={styles.dividerLine} />
            <span style={styles.dividerText}>or</span>
            <span style={styles.dividerLine} />
          </div>

          <button
            type="button"
            onClick={() => { setError(''); setGoogleLoading(true); googleLogin(); }}
            disabled={loading || googleLoading}
            style={{ ...styles.googleBtn, opacity: (loading || googleLoading) ? 0.7 : 1 }}
          >
            <span style={styles.googleG}>G</span>
            {googleLoading ? 'Signing in...' : 'Sign in with Google'}
          </button>

          <p style={styles.backLink}>
            <a href="/" style={styles.backAnchor}>← Back to Staff Portal</a>
          </p>
        </div>

        <p style={styles.footer}>eLoan Management System • Superuser Access Only</p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: 'flex',
    minHeight: '100vh',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },

  // Left branding panel
  left: {
    width: '420px',
    flexShrink: 0,
    background: 'linear-gradient(160deg, #010f24 0%, #02327a 100%)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '60px 48px',
    color: '#fff',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '48px',
  },
  logoBox: {
    width: '52px',
    height: '52px',
    borderRadius: '14px',
    background: 'rgba(255,255,255,0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(255,255,255,0.2)',
  },
  logoSymbol: {
    fontSize: '26px',
    fontWeight: '800',
    color: '#fff',
  },
  logoText: {
    fontSize: '32px',
    fontWeight: '800',
    color: '#fff',
    letterSpacing: '-0.5px',
  },
  tagline: {
    fontSize: '26px',
    fontWeight: '700',
    color: '#fff',
    margin: '0 0 12px 0',
    lineHeight: 1.3,
  },
  taglineSub: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 1.6,
    margin: '0 0 40px 0',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '100px',
    padding: '8px 16px',
    width: 'fit-content',
  },
  badgeIcon: {
    fontSize: '16px',
  },
  badgeText: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: '0.5px',
  },

  // Right login panel
  right: {
    flex: 1,
    background: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
  },
  card: {
    background: '#fff',
    borderRadius: '20px',
    padding: '44px 40px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    border: '1px solid #e2e8f0',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#0f172a',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '14px',
    color: '#64748b',
    margin: '0 0 28px 0',
  },
  error: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#dc2626',
    borderRadius: '10px',
    padding: '12px 16px',
    fontSize: '14px',
    marginBottom: '20px',
  },
  field: {
    marginBottom: '18px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    fontSize: '15px',
    border: '1.5px solid #e2e8f0',
    borderRadius: '10px',
    background: '#f8fafc',
    color: '#0f172a',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  btn: {
    width: '100%',
    padding: '14px',
    fontSize: '15px',
    fontWeight: '600',
    color: '#fff',
    background: 'linear-gradient(135deg, #02327a, #034199)',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    marginTop: '8px',
    boxShadow: '0 4px 12px rgba(2,50,122,0.35)',
    transition: 'opacity 0.2s',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '20px 0',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: '#e2e8f0',
    display: 'block',
  },
  dividerText: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  googleBtn: {
    width: '100%',
    padding: '13px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    background: '#fff',
    border: '1.5px solid #e2e8f0',
    borderRadius: '10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s, opacity 0.2s',
  },
  googleG: {
    fontSize: '17px',
    fontWeight: '800',
    color: '#4285F4',
  },
  backLink: {
    textAlign: 'center',
    marginTop: '24px',
    fontSize: '13px',
  },
  backAnchor: {
    color: '#64748b',
    textDecoration: 'none',
    fontWeight: '500',
  },
  footer: {
    marginTop: '32px',
    fontSize: '12px',
    color: '#94a3b8',
    textAlign: 'center',
  },
};
