import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import treasurerService from '../../services/treasurer.service';

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    stats: {},
    recent_forwarded: [],
  });

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const result = await treasurerService.getDashboard();
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

  const { stats, recent_forwarded } = data;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937', marginBottom: '1.5rem' }}>
        Treasurer Dashboard
      </h1>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard
          icon="&#128196;"
          label="Pending Evaluation"
          value={stats.pending_evaluation || 0}
          color="#f59e0b"
          link="/treasurer/applications"
        />
        <StatCard
          icon="&#10004;"
          label="Recommended (30d)"
          value={stats.recommended_applications || 0}
          color="#10b981"
        />
        <StatCard
          icon="&#10006;"
          label="Not Recommended (30d)"
          value={stats.not_recommended_applications || 0}
          color="#ef4444"
        />
        <StatCard
          icon="&#128176;"
          label="Active Loans"
          value={stats.total_active_loans || 0}
          color="#17236a"
          link="/treasurer/monitoring"
        />
        <StatCard
          icon="&#128181;"
          label="Collections This Month"
          value={`₱${parseFloat(stats.collections_this_month || 0).toLocaleString()}`}
          color="#10b981"
          link="/treasurer/payments"
        />
      </div>

      {/* Recent Forwarded Applications */}
      <div style={{ background: '#fff', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
            Applications Pending Evaluation
          </h2>
          <Link to="/treasurer/applications" style={{ color: '#10b981', fontSize: '0.875rem', textDecoration: 'none' }}>
          </Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={thStyle}>Applicant</th>
                <th style={thStyle}>Loan Type</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Date</th>
              </tr>
            </thead>
            <tbody>
              {recent_forwarded.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                    No applications pending evaluation
                  </td>
                </tr>
              ) : (
                recent_forwarded.map((app) => (
                  <tr
                    key={app.id}
                    onClick={() => navigate(`/treasurer/applications/${app.id}`)}
                    style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{app.applicant.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{app.applicant.email}</div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ background: '#d1fae5', color: '#065f46', padding: '0.25rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem' }}>
                        {app.loan_type}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      &#8369;{parseFloat(app.amount_requested).toLocaleString()}
                    </td>
                    <td style={{ ...tdStyle, color: '#6b7280', fontSize: '0.875rem' }}>
                      {new Date(app.application_date).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>{label}</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1f2937', margin: '0.5rem 0' }}>{value}</div>
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
          <span style={{ color: '#10b981', fontSize: '0.75rem' }}></span>
        </div>
      )}
    </div>
  );

  if (link) {
    return <Link to={link} style={{ textDecoration: 'none' }}>{content}</Link>;
  }
  return content;
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
