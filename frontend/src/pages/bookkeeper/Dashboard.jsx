import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import bookkeeperService from '../../services/bookkeeper.service';

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    stats: {},
    recent_applications: [],
    recent_activity: [],
  });

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const result = await bookkeeperService.getDashboard();
      setData(result);
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: '#fee2e2', color: '#dc2626', padding: '1rem', borderRadius: '0.5rem' }}>
        {error}
        <button onClick={fetchDashboard} style={{ marginLeft: '1rem', textDecoration: 'underline' }}>
          Retry
        </button>
      </div>
    );
  }

  const { stats, recent_applications, recent_activity } = data;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937', marginBottom: '1.5rem' }}>
        Dashboard
      </h1>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard
          icon="&#128196;"
          label="Pending Review"
          value={stats.total_submitted || 0}
          color="#17236a"
          link="/bookkeeper/applications"
        />
        <StatCard
          icon="&#10004;"
          label="Verified Today"
          value={stats.verified_today || 0}
          color="#10b981"
          link="/bookkeeper/applications"
        />
        <StatCard
          icon="&#10006;"
          label="Rejected Today"
          value={stats.rejected_today || 0}
          color="#ef4444"
          link="/bookkeeper/applications"
        />
        <StatCard
          icon="&#9203;"
          label="Waiting Treasurer"
          value={stats.waiting_treasurer || 0}
          color="#f59e0b"
          link="/bookkeeper/applications"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Recent Applications */}
        <div style={{ background: '#fff', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
              Recent Applications
            </h2>
            <Link to="/bookkeeper/applications" style={{ color: '#6366f1', fontSize: '0.875rem', textDecoration: 'none' }}>
              View All &rarr;
            </Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={thStyle}>Applicant</th>
                  <th style={thStyle}>Loan Type</th>
                  <th style={thStyle}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent_applications.length === 0 ? (
                  <tr>
                    <td colSpan="3" style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                      No pending applications
                    </td>
                  </tr>
                ) : (
                  recent_applications.map((app) => (
                    <tr
                      key={app.id}
                      onClick={() => navigate(`/bookkeeper/applications/${app.id}`)}
                      style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{app.applicant.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{app.applicant.email}</div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '0.25rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem' }}>
                          {app.loan_type}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        &#8369;{parseFloat(app.amount_requested).toLocaleString()}
                      </td>
                      <td style={tdStyle}>
                        <Link
                          to={`/bookkeeper/applications/${app.id}`}
                          style={{
                            background: '#17236a',
                            color: '#fff',
                            padding: '0.375rem 0.75rem',
                            borderRadius: '0.375rem',
                            fontSize: '0.75rem',
                            textDecoration: 'none',
                            display: 'inline-block',
                          }}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        <div style={{ background: '#fff', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
              Recent Activity
            </h2>
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {recent_activity.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                No recent activity
              </div>
            ) : (
              recent_activity.map((activity) => (
                <div key={activity.id} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: '0.75rem' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: activity.action === 'verified' ? '#d1fae5' : '#fee2e2',
                    color: activity.action === 'verified' ? '#059669' : '#dc2626',
                    flexShrink: 0,
                  }}>
                    {activity.action === 'verified' ? '&#10004;' : '&#10006;'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                      {activity.action === 'verified' ? 'Verified' : 'Rejected'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {activity.applicant_name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                      by {activity.verified_by} &bull; {formatTimeAgo(activity.verified_at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, link }) {
  const content = (
    <div style={{
      background: '#fff',
      borderRadius: '0.75rem',
      padding: '1.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      cursor: link ? 'pointer' : 'default',
      transition: 'box-shadow 0.15s',
    }}
    onMouseEnter={link ? e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)') : undefined}
    onMouseLeave={link ? e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)') : undefined}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>{label}</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#1f2937', margin: '0.5rem 0' }}>{value}</div>
        </div>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          background: `${color}15`,
          color: color,
        }}>
          <span dangerouslySetInnerHTML={{ __html: icon }} />
        </div>
      </div>
      {link && (
        <div style={{ marginTop: '0.5rem' }}>
          <span style={{ color: '#17236a', fontSize: '0.75rem' }}>View applications &rarr;</span>
        </div>
      )}
    </div>
  );

  if (link) {
    return <Link to={link} style={{ textDecoration: 'none' }}>{content}</Link>;
  }
  return content;
}

function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const thStyle = {
  padding: '0.75rem 1rem',
  textAlign: 'left',
  fontSize: '0.75rem',
  fontWeight: 500,
  color: '#6b7280',
  textTransform: 'uppercase',
};

const tdStyle = {
  padding: '0.75rem 1rem',
  fontSize: '0.875rem',
};
