import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import bookkeeperService from '../../services/bookkeeper.service';

const STATUS_COLORS = {
  'Submitted': { bg: '#fef3c7', text: '#92400e' },
  'Verified by Bookkeeper': { bg: '#dbeafe', text: '#1e40af' },
  'Pending Credit Committee': { bg: '#ede9fe', text: '#5b21b6' },
  'Approved by Credit Committee': { bg: '#d1fae5', text: '#065f46' },
  'Approved – For Disbursement': { bg: '#ede9fe', text: '#5b21b6' },
  'Active': { bg: '#d1fae5', text: '#065f46' },
  'Overdue': { bg: '#fee2e2', text: '#991b1b' },
  'Completed': { bg: '#f3f4f6', text: '#374151' },
  'Rejected by Bookkeeper': { bg: '#fee2e2', text: '#991b1b' },
  'Rejected by Treasurer': { bg: '#fee2e2', text: '#991b1b' },
  'Rejected by Credit Committee': { bg: '#fee2e2', text: '#991b1b' },
};

function getStatusStyle(statusName) {
  return STATUS_COLORS[statusName] || { bg: '#f3f4f6', text: '#374151' };
}

export default function Applications() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('submitted');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [applications, setApplications] = useState([]);
  const [activeLoans, setActiveLoans] = useState([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const [submittedResult, activeResult] = await Promise.all([
        bookkeeperService.getApplications(),
        bookkeeperService.getActiveLoans(),
      ]);
      setApplications(submittedResult.applications);
      setCount(submittedResult.count);
      setActiveLoans(activeResult.loans || []);
    } catch (err) {
      setError('Failed to load data');
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
          Loan Applications
        </h1>
        <button
          onClick={fetchAll}
          style={{
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            padding: '0.5rem 1rem',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          &#8635; Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '1.5rem', gap: '0.25rem' }}>
        <TabButton
          label="Submitted"
          badge={count}
          badgeColor="#92400e"
          badgeBg="#fef3c7"
          active={activeTab === 'submitted'}
          onClick={() => setActiveTab('submitted')}
        />
        <TabButton
          label="Active Loans"
          badge={activeLoans.length}
          badgeColor="#065f46"
          badgeBg="#d1fae5"
          active={activeTab === 'active'}
          onClick={() => setActiveTab('active')}
        />
      </div>

      {activeTab === 'submitted' && (
        <SubmittedTable applications={applications} navigate={navigate} />
      )}

      {activeTab === 'active' && (
        <ActiveLoansTable loans={activeLoans} navigate={navigate} />
      )}
    </div>
  );
}

function TabButton({ label, badge, badgeColor, badgeBg, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.625rem 1.25rem',
        border: 'none',
        borderBottom: active ? '2px solid #17236a' : '2px solid transparent',
        background: 'none',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
        color: active ? '#17236a' : '#6b7280',
        fontSize: '0.9rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '-2px',
      }}
    >
      {label}
      {badge > 0 && (
        <span style={{
          background: badgeBg,
          color: badgeColor,
          padding: '0.125rem 0.5rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 600,
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function SubmittedTable({ applications, navigate }) {
  return (
    <div style={{ background: '#fff', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
          Pending Review
          <span style={{
            marginLeft: '0.5rem',
            background: '#fef3c7',
            color: '#92400e',
            padding: '0.25rem 0.5rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
          }}>
            {applications.length} applications
          </span>
        </h2>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Applicant</th>
              <th style={thStyle}>Loan Type</th>
              <th style={thStyle}>Amount</th>
              <th style={thStyle}>Term</th>
              <th style={thStyle}>Date Submitted</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {applications.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#128229;</div>
                  <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>No Pending Applications</h3>
                  <p style={{ margin: 0, fontSize: '0.875rem' }}>All submitted applications have been reviewed.</p>
                </td>
              </tr>
            ) : (
              applications.map((app) => {
                const statusStyle = getStatusStyle(app.status);
                return (
                  <tr
                    key={app.id}
                    onClick={() => navigate(`/bookkeeper/applications/${app.id}`)}
                    style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={tdStyle}>
                      <span style={{ background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>
                        #{app.id}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <ApplicantCell name={app.applicant.name} email={app.applicant.email} />
                    </td>
                    <td style={tdStyle}>
                      <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 500 }}>
                        {app.loan_type}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      &#8369;{parseFloat(app.amount_requested).toLocaleString()}
                    </td>
                    <td style={tdStyle}>{app.term_months} months</td>
                    <td style={tdStyle}>
                      <div>{formatDate(app.application_date)}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{formatTime(app.application_date)}</div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ background: statusStyle.bg, color: statusStyle.text, padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 500 }}>
                        {app.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActiveLoansTable({ loans, navigate }) {
  return (
    <div style={{ background: '#fff', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
          Active Loans
          <span style={{
            marginLeft: '0.5rem',
            background: '#d1fae5',
            color: '#065f46',
            padding: '0.25rem 0.5rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
          }}>
            {loans.length} loans
          </span>
        </h2>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Member</th>
              <th style={thStyle}>Loan Type</th>
              <th style={thStyle}>Amount</th>
              <th style={thStyle}>Balance</th>
              <th style={thStyle}>Released</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Disbursement</th>
            </tr>
          </thead>
          <tbody>
            {loans.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#128197;</div>
                  <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>No Active Loans</h3>
                  <p style={{ margin: 0, fontSize: '0.875rem' }}>No loans are currently active.</p>
                </td>
              </tr>
            ) : (
              loans.map((loan) => {
                const statusStyle = getStatusStyle(loan.status);
                return (
                  <tr
                    key={loan.loan_id}
                    onClick={() => navigate(`/bookkeeper/applications/${loan.loan_id}`)}
                    style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={tdStyle}>
                      <span style={{ background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>
                        #{loan.loan_id}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <ApplicantCell name={loan.borrower} email={loan.borrower_email} />
                    </td>
                    <td style={tdStyle}>
                      <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 500 }}>
                        {loan.loan_type}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      &#8369;{parseFloat(loan.amount_requested).toLocaleString()}
                    </td>
                    <td style={{ ...tdStyle, color: '#dc2626', fontWeight: 500 }}>
                      {loan.remaining_balance != null
                        ? `₱${parseFloat(loan.remaining_balance).toLocaleString()}`
                        : '—'}
                    </td>
                    <td style={tdStyle}>
                      {loan.released_at ? (
                        <>
                          <div>{formatDate(loan.released_at)}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{formatTime(loan.released_at)}</div>
                        </>
                      ) : '—'}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ background: statusStyle.bg, color: statusStyle.text, padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 500 }}>
                        {loan.status}
                      </span>
                      {loan.loan_health_status && loan.loan_health_status !== 'on_time' && (
                        <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '0.25rem' }}>
                          {loan.loan_health_status}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle} onClick={e => e.stopPropagation()}>
                      {loan.disbursement_recorded ? (
                        <span style={{ color: '#059669', fontSize: '0.8rem', fontWeight: 500 }}>
                          ✓ Recorded
                        </span>
                      ) : (
                        <button
                          onClick={() => navigate(`/bookkeeper/applications/${loan.loan_id}`)}
                          style={{
                            background: '#17236a',
                            color: '#fff',
                            border: 'none',
                            padding: '0.375rem 0.75rem',
                            borderRadius: '0.375rem',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            fontWeight: 500,
                          }}
                        >
                          Record
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ApplicantCell({ name, email }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{
        width: '36px',
        height: '36px',
        background: '#17236a',
        color: '#fff',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: '0.75rem',
        flexShrink: 0,
      }}>
        {initials}
      </div>
      <div>
        <div style={{ fontWeight: 500 }}>{name}</div>
        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{email}</div>
      </div>
    </div>
  );
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
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
