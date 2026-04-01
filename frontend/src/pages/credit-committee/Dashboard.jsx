import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import creditCommitteeService from '../../services/creditCommittee.service';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    stats: {},
    recent_applications: [],
    recent_decisions: [],
  });

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const result = await creditCommitteeService.getDashboard();
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

  const { stats, recent_applications, recent_decisions } = data;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937', marginBottom: '1.5rem' }}>
        Credit Committee Dashboard
      </h1>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard
          icon="&#128203;"
          label="Pending Decision"
          value={stats.pending_count || 0}
          color="#f59e0b"
          link="/credit-committee/applications"
        />
        <StatCard
          icon="&#10004;"
          label="Approved (This Month)"
          value={stats.approved_this_month || 0}
          color="#10b981"
        />
        <StatCard
          icon="&#10006;"
          label="Rejected (This Month)"
          value={stats.rejected_this_month || 0}
          color="#ef4444"
        />
        <StatCard
          icon="&#8634;"
          label="Returned (This Month)"
          value={stats.returned_this_month || 0}
          color="#17236a"
        />
        <StatCard
          icon="&#9200;"
          label="Avg Decision Time"
          value={stats.avg_decision_time ? `${stats.avg_decision_time} days` : 'N/A'}
          color="#8b5cf6"
        />
      </div>

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Pending Applications */}
        <div style={{ background: '#fff', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
              Applications Awaiting Review
            </h2>
            <Link to="/credit-committee/applications" style={{ color: '#8b5cf6', fontSize: '0.875rem', textDecoration: 'none' }}>
              View All &rarr;
            </Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={thStyle}>Applicant</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {recent_applications.length === 0 ? (
                  <tr>
                    <td colSpan="3" style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                      No applications pending
                    </td>
                  </tr>
                ) : (
                  recent_applications.map((app) => (
                    <tr key={app.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{app.applicant.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{app.loan_type}</div>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        &#8369;{parseFloat(app.amount_requested).toLocaleString()}
                      </td>
                      <td style={tdStyle}>
                        <Link
                          to={`/credit-committee/applications/${app.id}`}
                          style={{
                            background: '#8b5cf6',
                            color: '#fff',
                            padding: '0.375rem 0.75rem',
                            borderRadius: '0.375rem',
                            fontSize: '0.75rem',
                            textDecoration: 'none',
                            display: 'inline-block',
                          }}
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Decisions */}
        <div style={{ background: '#fff', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
              Recent Decisions
            </h2>
            <Link to="/credit-committee/decisions" style={{ color: '#8b5cf6', fontSize: '0.875rem', textDecoration: 'none' }}>
              View All &rarr;
            </Link>
          </div>
          <div style={{ padding: '0.5rem' }}>
            {recent_decisions.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                No recent decisions
              </div>
            ) : (
              recent_decisions.map((d) => (
                <div key={d.id} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{d.applicant}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        by {d.decided_by} - {new Date(d.decided_at).toLocaleDateString()}
                      </div>
                    </div>
                    <DecisionBadge decision={d.decision} />
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
          <span style={{ color: '#8b5cf6', fontSize: '0.75rem' }}>View details &rarr;</span>
        </div>
      )}
    </div>
  );

  if (link) {
    return <Link to={link} style={{ textDecoration: 'none' }}>{content}</Link>;
  }
  return content;
}

function DecisionBadge({ decision }) {
  const styles = {
    approved: { background: '#d1fae5', color: '#065f46' },
    rejected: { background: '#fee2e2', color: '#991b1b' },
    returned: { background: '#dbeafe', color: '#1e40af' },
  };

  const labels = {
    approved: 'Approved',
    rejected: 'Rejected',
    returned: 'Returned',
  };

  return (
    <span style={{
      ...styles[decision],
      padding: '0.25rem 0.75rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: 500,
    }}>
      {labels[decision]}
    </span>
  );
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
