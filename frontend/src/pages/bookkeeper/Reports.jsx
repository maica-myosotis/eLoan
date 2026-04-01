import { useState, useEffect } from 'react';
import bookkeeperService from '../../services/bookkeeper.service';

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('status');

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const result = await bookkeeperService.getReports();
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
        <div style={{ textAlign: 'center', color: '#6b7280' }}>Loading reports...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ background: '#fee2e2', color: '#dc2626', padding: '1rem', borderRadius: '0.5rem' }}>
        {error || 'Failed to load reports'}
        <button onClick={fetchReports} style={{ marginLeft: '1rem', textDecoration: 'underline' }}>
          Retry
        </button>
      </div>
    );
  }

  const { status_report, loan_type_report, monthly_report, verification_stats, daily_trend } = data;

  const tabs = [
    { id: 'status', label: 'By Status' },
    { id: 'loan_type', label: 'By Loan Type' },
    { id: 'monthly', label: 'Monthly Trend' },
    { id: 'daily', label: 'Daily Activity' },
  ];

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937', marginBottom: '1.5rem' }}>
        Reports & Analytics
      </h1>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard label="Total Processed (30 days)" value={verification_stats.total} color="#17236a" />
        <StatCard label="Verified" value={verification_stats.verified} color="#10b981" />
        <StatCard label="Rejected" value={verification_stats.rejected} color="#ef4444" />
        <StatCard label="Approval Rate" value={`${verification_stats.approval_rate.toFixed(1)}%`} color="#f59e0b" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #17236a' : '2px solid transparent',
              background: activeTab === tab.id ? '#fff' : 'transparent',
              color: activeTab === tab.id ? '#17236a' : '#6b7280',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
              borderRadius: '0.375rem 0.375rem 0 0',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ background: '#fff', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        {activeTab === 'status' && (
          <ReportTable
            title="Applications by Status"
            data={status_report}
            columns={[
              { key: 'current_status__status_name', label: 'Status', render: (val) => <StatusBadge status={val || 'Unknown'} /> },
              { key: 'count', label: 'Count' },
            ]}
          />
        )}

        {activeTab === 'loan_type' && (
          <ReportTable
            title="Applications by Loan Type"
            data={loan_type_report}
            columns={[
              { key: 'loan_type__loan_name', label: 'Loan Type', render: (val) => (
                <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '0.25rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem' }}>
                  {val}
                </span>
              )},
              { key: 'count', label: 'Applications' },
            ]}
          />
        )}

        {activeTab === 'monthly' && (
          <ReportTable
            title="Monthly Application Trend (Last 6 Months)"
            data={monthly_report}
            columns={[
              { key: 'month', label: 'Month', render: (val) => formatMonth(val) },
              { key: 'count', label: 'Applications' },
            ]}
          />
        )}

        {activeTab === 'daily' && (
          <ReportTable
            title="Daily Verification Activity (Last 14 Days)"
            data={daily_trend}
            columns={[
              { key: 'date', label: 'Date', render: (val) => formatDate(val) },
              { key: 'action', label: 'Action', render: (val) => (
                <span style={{
                  background: val === 'verified' ? '#d1fae5' : '#fee2e2',
                  color: val === 'verified' ? '#065f46' : '#991b1b',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                }}>
                  {val === 'verified' ? 'Verified' : 'Rejected'}
                </span>
              )},
              { key: 'count', label: 'Count' },
            ]}
          />
        )}
      </div>

      {/* Summary */}
      <div style={{ marginTop: '1.5rem', background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>
          Report Summary
        </h3>
        <p style={{ margin: 0, color: '#6b7280' }}>
          In the last 30 days, the bookkeeper team has processed <strong>{verification_stats.total}</strong> applications
          with an approval rate of <strong>{verification_stats.approval_rate.toFixed(1)}%</strong>.{' '}
          <strong>{verification_stats.verified}</strong> applications were verified and forwarded to the Treasurer,
          while <strong>{verification_stats.rejected}</strong> were rejected.
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '0.75rem',
      padding: '1.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    }}>
      <div style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function ReportTable({ title, data, columns }) {
  const total = data.reduce((sum, item) => sum + (item.count || 0), 0);

  return (
    <>
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {columns.map((col) => (
                <th key={col.key} style={thStyle}>{col.label}</th>
              ))}
              <th style={thStyle}>Percentage</th>
              <th style={{ ...thStyle, width: '40%' }}>Distribution</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                  No data available
                </td>
              </tr>
            ) : (
              data.map((item, index) => {
                const percentage = total > 0 ? (item.count / total * 100).toFixed(1) : 0;
                return (
                  <tr key={index} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    {columns.map((col) => (
                      <td key={col.key} style={tdStyle}>
                        {col.render ? col.render(item[col.key]) : item[col.key]}
                      </td>
                    ))}
                    <td style={tdStyle}>{percentage}%</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{
                          flex: 1,
                          height: '8px',
                          background: '#e5e7eb',
                          borderRadius: '4px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${percentage}%`,
                            height: '100%',
                            background: '#17236a',
                            borderRadius: '4px',
                          }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StatusBadge({ status }) {
  let bgColor = '#f3f4f6';
  let textColor = '#374151';

  if (status.includes('Submitted')) {
    bgColor = '#fef3c7';
    textColor = '#92400e';
  } else if (status.includes('Verified')) {
    bgColor = '#d1fae5';
    textColor = '#065f46';
  } else if (status.includes('Rejected')) {
    bgColor = '#fee2e2';
    textColor = '#991b1b';
  } else if (status.includes('Pending')) {
    bgColor = '#e0e7ff';
    textColor = '#3730a3';
  }

  return (
    <span style={{
      background: bgColor,
      color: textColor,
      padding: '0.25rem 0.75rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: 500,
    }}>
      {status}
    </span>
  );
}

function formatMonth(monthStr) {
  if (!monthStr) return 'N/A';
  const [year, month] = monthStr.split('-');
  const date = new Date(year, month - 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
