import { useState, useEffect, useCallback } from 'react';
import treasurerService from '../../services/treasurer.service';

export default function LoanMonitoring() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loans, setLoans] = useState([]);
  const [filter, setFilter] = useState('all');
  const [releasingId, setReleasingId] = useState(null);
  const [releaseModal, setReleaseModal] = useState(null); // loan object or null
  const [releaseRemarks, setReleaseRemarks] = useState('');
  const [releaseError, setReleaseError] = useState('');

  const fetchLoans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await treasurerService.getLoansForMonitoring();
      setLoans(result.loans || []);
    } catch (err) {
      setError('Failed to load loans');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  const handleReleaseFunds = async () => {
    if (!releaseModal) return;
    setReleasingId(releaseModal.id);
    setReleaseError('');
    try {
      await treasurerService.releaseFunds(releaseModal.id, releaseRemarks);
      setReleaseModal(null);
      setReleaseRemarks('');
      await fetchLoans();
    } catch (err) {
      setReleaseError(err?.response?.data?.error || 'Failed to release funds. Please try again.');
    } finally {
      setReleasingId(null);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Approved \u2013 For Disbursement':
        return { bg: '#ede9fe', color: '#7c3aed' };
      case 'Disbursed':
      case 'Active':
        return { bg: '#dbeafe', color: '#1e40af' };
      case 'Overdue':
        return { bg: '#fee2e2', color: '#dc2626' };
      case 'Paid':
      case 'Completed':
        return { bg: '#d1fae5', color: '#065f46' };
      default:
        return { bg: '#f3f4f6', color: '#6b7280' };
    }
  };

  const pendingDisbursement = loans.filter(l => l.status === 'Approved \u2013 For Disbursement');
  const activeLoans = loans.filter(l => ['Disbursed', 'Active'].includes(l.status));
  const overdueLoans = loans.filter(l => l.status === 'Overdue');
  const completedLoans = loans.filter(l => ['Paid', 'Completed'].includes(l.status));

  const filteredLoans = loans.filter(loan => {
    if (filter === 'all') return loan.status !== 'Approved \u2013 For Disbursement';
    if (filter === 'active') return ['Disbursed', 'Active'].includes(loan.status);
    if (filter === 'overdue') return loan.status === 'Overdue';
    if (filter === 'completed') return ['Paid', 'Completed'].includes(loan.status);
    return true;
  });

  const stats = {
    pendingDisbursement: pendingDisbursement.length,
    active: activeLoans.length,
    overdue: overdueLoans.length,
    completed: completedLoans.length,
    totalOutstanding: [...activeLoans, ...overdueLoans].reduce(
      (sum, l) => sum + parseFloat(l.remaining_balance || 0), 0
    ),
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', color: '#6b7280', fontSize: '1rem' }}>Loading loans...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: '#fee2e2', color: '#dc2626', padding: '1rem', borderRadius: '0.5rem' }}>
        {error}
        <button onClick={fetchLoans} style={{ marginLeft: '1rem', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937', marginBottom: '1.5rem' }}>
        Loan Monitoring
      </h1>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <SummaryCard label="Pending Disbursement" value={stats.pendingDisbursement} color="#7c3aed" />
        <SummaryCard label="Active" value={stats.active} color="#3b82f6" />
        <SummaryCard label="Overdue" value={stats.overdue} color="#ef4444" />
        <SummaryCard label="Completed" value={stats.completed} color="#10b981" />
        <SummaryCard
          label="Total Outstanding"
          value={`₱${stats.totalOutstanding.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
          color="#f59e0b"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Approved – For Disbursement section                                 */}
      {/* ------------------------------------------------------------------ */}
      {pendingDisbursement.length > 0 && (
        <div style={{
          background: '#faf5ff',
          border: '1px solid #e9d5ff',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          marginBottom: '1.5rem',
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#6d28d9', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ background: '#7c3aed', color: '#fff', borderRadius: '9999px', padding: '0.125rem 0.6rem', fontSize: '0.75rem' }}>
              {pendingDisbursement.length}
            </span>
            Approved – Awaiting Fund Release
          </h2>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#ede9fe' }}>
                  <th style={thStyle}>Borrower</th>
                  <th style={thStyle}>Loan Type</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Term</th>
                  <th style={thStyle}>Approved On</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingDisbursement.map((loan) => (
                  <tr key={loan.id} style={{ borderBottom: '1px solid #e9d5ff', background: '#fff' }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{loan.borrower?.name || loan.borrower}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{loan.borrower?.email}</div>
                    </td>
                    <td style={tdStyle}>{loan.loan_type}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#1f2937' }}>
                      ₱{parseFloat(loan.original_amount || loan.total_payable || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={tdStyle}>—</td>
                    <td style={tdStyle}>
                      {loan.approved_at ? new Date(loan.approved_at).toLocaleDateString('en-PH') : '—'}
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => { setReleaseModal(loan); setReleaseRemarks(''); setReleaseError(''); }}
                        disabled={releasingId === loan.id}
                        style={{
                          background: '#7c3aed',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '0.375rem',
                          padding: '0.4rem 0.9rem',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          opacity: releasingId === loan.id ? 0.6 : 1,
                        }}
                      >
                        {releasingId === loan.id ? 'Releasing…' : 'Release Funds'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Active / Overdue / Completed loans                                  */}
      {/* ------------------------------------------------------------------ */}

      {/* Filter Tabs */}
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: 'All Active', count: activeLoans.length + overdueLoans.length },
          { key: 'active', label: 'Active', count: stats.active },
          { key: 'overdue', label: 'Overdue', count: stats.overdue },
          { key: 'completed', label: 'Completed', count: stats.completed },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: 'none',
              background: filter === key ? '#17236a' : '#f3f4f6',
              color: filter === key ? '#fff' : '#374151',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.875rem',
            }}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Loans Table */}
      <div style={{ background: '#fff', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={thStyle}>Borrower</th>
                <th style={thStyle}>Loan Type</th>
                <th style={thStyle}>Original Amount</th>
                <th style={thStyle}>Total Paid</th>
                <th style={thStyle}>Remaining Balance</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                    No loans found
                  </td>
                </tr>
              ) : (
                filteredLoans.map((loan) => {
                  const statusStyle = getStatusColor(loan.status);
                  const totalPayable = parseFloat(loan.total_payable || 0);
                  const totalPaid = parseFloat(loan.total_paid || 0);
                  const progressPercent = totalPayable > 0 ? (totalPaid / totalPayable) * 100 : 0;

                  return (
                    <tr key={loan.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{loan.borrower?.name || loan.borrower}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{loan.borrower?.email}</div>
                      </td>
                      <td style={tdStyle}>{loan.loan_type}</td>
                      <td style={tdStyle}>₱{parseFloat(loan.original_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td style={tdStyle}>
                        <div>₱{totalPaid.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
                        <div style={{ width: '100px', height: '4px', background: '#e5e7eb', borderRadius: '2px', marginTop: '0.25rem' }}>
                          <div style={{ width: `${Math.min(progressPercent, 100)}%`, height: '100%', background: '#10b981', borderRadius: '2px' }} />
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        <span style={{ color: parseFloat(loan.remaining_balance) === 0 ? '#10b981' : '#dc2626' }}>
                          ₱{parseFloat(loan.remaining_balance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          background: statusStyle.bg,
                          color: statusStyle.color,
                          whiteSpace: 'nowrap',
                        }}>
                          {loan.status}
                        </span>
                        {loan.loan_health_status && loan.loan_health_status !== 'on_time' && (
                          <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '0.15rem', textTransform: 'capitalize' }}>
                            {loan.loan_health_status.replace('_', ' ')}
                          </div>
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

      {/* ------------------------------------------------------------------ */}
      {/* Release Funds Modal                                                  */}
      {/* ------------------------------------------------------------------ */}
      {releaseModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{
            background: '#fff', borderRadius: '0.75rem', padding: '1.5rem',
            width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1f2937', marginBottom: '0.5rem' }}>
              Release Funds
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
              You are about to release funds for{' '}
              <strong>{releaseModal.borrower?.name || releaseModal.borrower}</strong>
              {' '}—{' '}
              <strong>{releaseModal.loan_type}</strong>{' '}
              (₱{parseFloat(releaseModal.original_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}).
              <br /><br />
              This will set the loan to <strong>Active</strong> and generate the payment schedule.
            </p>

            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>
              Remarks (optional)
            </label>
            <textarea
              value={releaseRemarks}
              onChange={(e) => setReleaseRemarks(e.target.value)}
              placeholder="e.g. Funds transferred via bank on March 31, 2026"
              rows={3}
              style={{
                width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db',
                borderRadius: '0.375rem', fontSize: '0.875rem', resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />

            {releaseError && (
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem', marginTop: '0.75rem' }}>
                {releaseError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button
                onClick={() => { setReleaseModal(null); setReleaseRemarks(''); setReleaseError(''); }}
                disabled={releasingId === releaseModal.id}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '0.375rem',
                  border: '1px solid #d1d5db', background: '#fff',
                  color: '#374151', cursor: 'pointer', fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReleaseFunds}
                disabled={releasingId === releaseModal.id}
                style={{
                  padding: '0.5rem 1.25rem', borderRadius: '0.375rem',
                  border: 'none', background: '#7c3aed',
                  color: '#fff', cursor: 'pointer', fontWeight: 500,
                  opacity: releasingId === releaseModal.id ? 0.6 : 1,
                }}
              >
                {releasingId === releaseModal.id ? 'Releasing…' : 'Confirm Release'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '0.75rem',
      padding: '1rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1f2937' }}>{value}</div>
    </div>
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
