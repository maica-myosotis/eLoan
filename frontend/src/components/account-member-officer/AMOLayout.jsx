import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import authService from '../../services/auth.service';
import amoService from '../../services/amo.service';

export default function AMOLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.role !== 'Account Member Officer') {
      navigate('/');
      return;
    }
    setUser(currentUser);
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [navigate]);

  const fetchUnreadCount = async () => {
    try {
      const data = await amoService.getUnreadCount();
      setUnreadCount(data.unread_count);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const handleLogout = () => {
    authService.logout();
    navigate('/');
  };

  const navItems = [
    { path: '/amo/dashboard', icon: 'grid', label: 'Dashboard' },
    { path: '/amo/applications', icon: 'user-check', label: 'Member Applications' },
    { path: '/amo/members', icon: 'users', label: 'Members' },
    { path: '/amo/savings-capital', icon: 'dollar-sign', label: 'Savings & Capital' },
    { path: '/amo/reports', icon: 'bar-chart-2', label: 'Reports' },
    { path: '/amo/activity-logs', icon: 'activity', label: 'Activity Logs' },
    { path: '/amo/notifications', icon: 'bell', label: 'Notifications', badge: unreadCount },
    { path: '/amo/settings', icon: 'settings', label: 'Settings' },
  ];

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f3f4f6' }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? '260px' : '70px',
        background: '#17236a',
        padding: '1.5rem',
        transition: 'width 0.3s',
        position: 'fixed',
        height: '100vh',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        {/* Brand */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0.5rem 0 1.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          marginBottom: '1.5rem',
        }}>
          <span style={{ fontSize: '1.75rem', marginRight: sidebarOpen ? '0.75rem' : 0 }}>&#128176;</span>
          {sidebarOpen && (
            <div>
              <div style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700 }}>eLoan</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem', fontWeight: 500 }}>Account Member Officer</div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1 }}>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                marginBottom: '0.25rem',
                borderRadius: '0.5rem',
                color: isActive(item.path) ? '#fff' : '#9ca3af',
                background: isActive(item.path) ? 'rgba(255,255,255,0.15)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
            >
              <Icon name={item.icon} />
              {sidebarOpen && (
                <>
                  <span style={{ marginLeft: '0.75rem', fontSize: '0.875rem' }}>{item.label}</span>
                  {item.badge > 0 && (
                    <span style={{
                      marginLeft: 'auto',
                      background: '#ef4444',
                      color: '#fff',
                      fontSize: '0.65rem',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '9999px',
                      fontWeight: 600,
                    }}>
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          ))}
        </nav>

        {/* Logout */}
        <button
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            color: '#ef4444',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
          }}
        >
          <Icon name="log-out" />
          {sidebarOpen && <span style={{ marginLeft: '0.75rem' }}>Logout</span>}
        </button>
      </aside>

      {/* Main Content */}
      <main style={{
        flex: 1,
        marginLeft: sidebarOpen ? '260px' : '70px',
        transition: 'margin-left 0.3s',
      }}>
        {/* Top Navbar */}
        <nav style={{
          background: '#fff',
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', color: '#6b7280' }}
          >
            <Icon name="menu" />
          </button>

          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '40px',
                height: '40px',
                background: '#17236a',
                color: '#fff',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '0.875rem',
              }}>
                {user.firstname?.[0]}{user.lastname?.[0]}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#1f2937', fontSize: '0.875rem' }}>
                  {user.firstname} {user.lastname}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Account Member Officer</div>
              </div>
            </div>
          )}
        </nav>

        {/* Page Content */}
        <div style={{ padding: '1.5rem' }}>
          <Outlet context={{ user, fetchUnreadCount }} />
        </div>
      </main>
    </div>
  );
}

function Icon({ name }) {
  const icons = {
    'grid': (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>
      </svg>
    ),
    'user-check': (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline>
      </svg>
    ),
    'users': (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
      </svg>
    ),
    'dollar-sign': (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="1" x2="12" y2="23"></line>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
      </svg>
    ),
    'bar-chart-2': (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="20" x2="18" y2="10"></line>
        <line x1="12" y1="20" x2="12" y2="4"></line>
        <line x1="6" y1="20" x2="6" y2="14"></line>
      </svg>
    ),
    'activity': (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
      </svg>
    ),
    'bell': (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
      </svg>
    ),
    'settings': (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    ),
    'log-out': (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16 17 21 12 16 7"></polyline>
        <line x1="21" y1="12" x2="9" y2="12"></line>
      </svg>
    ),
    'menu': (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    ),
  };
  return icons[name] || null;
}