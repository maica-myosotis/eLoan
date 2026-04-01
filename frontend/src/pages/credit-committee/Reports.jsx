import { useState, useEffect } from 'react';
import creditCommitteeService from '../../services/creditCommittee.service';

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const result = await creditCommitteeService.getReports('summary');
      setData(result);
    } catch (err) {
      setError('Failed to load reports');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: '#fee2e2', color: '#dc2626', padding: '1rem', borderRadius: '0.5rem' }}>
        {error}
        <button onClick={fetchReports} style={{ marginLeft: '1rem', textDecoration: 'underline' }}>
          Retry
        </button>
      </div>
    );
  }

  const { approval_stats, monthly_stats, loan_type_distribution, high_risk_stats } = data;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937', marginBottom: '1.5rem' }}>
        Reports & Analytics
      </h1>

      {/* Stats Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard
          label="Approval Rate"
          value={`${approval_stats?.approval_rate?.toFixed(1) || 0}%`}
          sublabel={`${approval_stats?.approved || 0} of ${approval_stats?.total || 0} applications`}
          color="#10b981"
        />
        <StatCard
          label="Rejection Rate"
          value={`${approval_stats?.rejection_rate?.toFixed(1) || 0}%`}
          sublabel={`${approval_stats?.rejected || 0} rejections`}
          color="#ef4444"
        />
        <StatCard
          label="High Risk Approval Ratio"
          value={`${high_risk_stats?.ratio?.toFixed(1) || 0}%`}
          sublabel={`${high_risk_stats?.high_risk_approved || 0} high-risk approved`}
          color="#f59e0b"
        />
        <StatCard
          label="Returns to Treasurer"
          value={approval_stats?.returned || 0}
          sublabel="Last 30 days"
          color="#17236a"
        />
      </div>

      {/* Charts Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Monthly Trends */}
        <div style={{
          background: '#fff',
          borderRadius: '0.75rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          padding: '1.5rem',
        }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1f2937', marginBottom: '1rem' }}>
            Monthly Decision Trends
          </h2>
          <div style={{ height: '300px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '1rem 0' }}>
            {monthly_stats && monthly_stats.length > 0 ? (
              <MonthlyChart data={monthly_stats} />
            ) : (
              <div style={{ color: '#6b7280', textAlign: 'center', width: '100%' }}>
                No monthly data available
              </div>
            )}
          </div>
        </div>

        {/* Loan Type Distribution */}
        <div style={{
          background: '#fff',
          borderRadius: '0.75rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          padding: '1.5rem',
        }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1f2937', marginBottom: '1rem' }}>
            Decisions by Loan Type
          </h2>
          <div style={{ padding: '1rem 0' }}>
            {loan_type_distribution && loan_type_distribution.length > 0 ? (
              <LoanTypeChart data={loan_type_distribution} />
            ) : (
              <div style={{ color: '#6b7280', textAlign: 'center' }}>
                No loan type data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Table */}
      <div style={{
        background: '#fff',
        borderRadius: '0.75rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginTop: '1.5rem',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
            Decision Summary (Last 30 Days)
          </h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '1rem 1.5rem', fontWeight: 500 }}>Total Applications Decided</td>
              <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontWeight: 600 }}>{approval_stats?.total || 0}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '1rem 1.5rem', fontWeight: 500 }}>Approved</td>
              <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                <span style={{ color: '#10b981', fontWeight: 600 }}>{approval_stats?.approved || 0}</span>
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '1rem 1.5rem', fontWeight: 500 }}>Rejected</td>
              <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>{approval_stats?.rejected || 0}</span>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '1rem 1.5rem', fontWeight: 500 }}>Returned to Treasurer</td>
              <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                <span style={{ color: '#17236a', fontWeight: 600 }}>{approval_stats?.returned || 0}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, sublabel, color }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '0.75rem',
      padding: '1.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#1f2937' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>{sublabel}</div>
    </div>
  );
}

function MonthlyChart({ data }) {
  // Group by month and decision type
  const grouped = {};
  data.forEach(item => {
    const month = new Date(item.month).toLocaleDateString('en-US', { month: 'short' });
    if (!grouped[month]) {
      grouped[month] = { approved: 0, rejected: 0, returned: 0 };
    }
    grouped[month][item.decision] = item.count;
  });

  const months = Object.keys(grouped);
  const maxValue = Math.max(
    ...months.map(m => Math.max(grouped[m].approved, grouped[m].rejected, grouped[m].returned))
  ) || 1;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', width: '100%', height: '250px' }}>
      {months.map(month => (
        <div key={month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '200px' }}>
            <div
              style={{
                width: '20px',
                height: `${(grouped[month].approved / maxValue) * 100}%`,
                background: '#10b981',
                borderRadius: '4px 4px 0 0',
                minHeight: '4px',
              }}
              title={`Approved: ${grouped[month].approved}`}
            />
            <div
              style={{
                width: '20px',
                height: `${(grouped[month].rejected / maxValue) * 100}%`,
                background: '#ef4444',
                borderRadius: '4px 4px 0 0',
                minHeight: '4px',
              }}
              title={`Rejected: ${grouped[month].rejected}`}
            />
            <div
              style={{
                width: '20px',
                height: `${(grouped[month].returned / maxValue) * 100}%`,
                background: '#17236a',
                borderRadius: '4px 4px 0 0',
                minHeight: '4px',
              }}
              title={`Returned: ${grouped[month].returned}`}
            />
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{month}</div>
        </div>
      ))}
      {months.length === 0 && (
        <div style={{ color: '#6b7280' }}>No data available</div>
      )}
    </div>
  );
}

function LoanTypeChart({ data }) {
  // Group by loan type
  const grouped = {};
  data.forEach(item => {
    const loanType = item['application__loan_type__loan_name'] || 'Unknown';
    if (!grouped[loanType]) {
      grouped[loanType] = { approved: 0, rejected: 0, returned: 0, total: 0 };
    }
    grouped[loanType][item.decision] = item.count;
    grouped[loanType].total += item.count;
  });

  const loanTypes = Object.keys(grouped);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {loanTypes.map(loanType => {
        const total = grouped[loanType].total || 1;
        return (
          <div key={loanType}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{loanType}</span>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{total} decisions</span>
            </div>
            <div style={{ display: 'flex', height: '12px', borderRadius: '6px', overflow: 'hidden', background: '#e5e7eb' }}>
              <div style={{ width: `${(grouped[loanType].approved / total) * 100}%`, background: '#10b981' }} />
              <div style={{ width: `${(grouped[loanType].rejected / total) * 100}%`, background: '#ef4444' }} />
              <div style={{ width: `${(grouped[loanType].returned / total) * 100}%`, background: '#17236a' }} />
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'center' }}>
        <LegendItem color="#10b981" label="Approved" />
        <LegendItem color="#ef4444" label="Rejected" />
        <LegendItem color="#17236a" label="Returned" />
      </div>
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: color }} />
      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{label}</span>
    </div>
  );
}
