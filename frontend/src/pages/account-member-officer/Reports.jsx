import { useState, useEffect } from 'react';
import amoService from '../../services/amo.service';

export default function AMOReports() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    amoService.getReports().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;

  const reg = data?.registration_summary || {};
  const sc = data?.savings_capital_summary || {};

  const pct = (val, total) => total > 0 ? Math.round((val / total) * 100) : 0;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.25rem' }}>Reports</h1>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>Member registration and financial summaries</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Registration Summary */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '1.25rem' }}>Member Registration Summary</h2>
          <StatRow label="Total Applicants" value={reg.total ?? 0} color="#6b7280" />
          <StatRow label="Pending" value={reg.pending ?? 0} color="#f59e0b" />
          <StatRow label="Approved" value={reg.approved ?? 0} color="#10b981" />
          <StatRow label="Rejected" value={reg.rejected ?? 0} color="#ef4444" />

          {/* Bar chart */}
          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>Approval Rate</div>
            <div style={{ background: '#f3f4f6', borderRadius: '9999px', height: '10px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${pct(reg.approved, reg.total)}%`,
                background: '#10b981',
                borderRadius: '9999px',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '0.25rem', fontWeight: 600 }}>
              {pct(reg.approved, reg.total)}% approved
            </div>
          </div>
        </div>

        {/* Savings & Capital Summary */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '1.25rem' }}>Savings & Capital Summary</h2>
          <StatRow label="Total Members" value={sc.total_members ?? 0} color="#6b7280" />
          <StatRow label="Regular Members" value={sc.regular_members ?? 0} color="#10b981" />
          <StatRow label="Associate Members" value={sc.associate_members ?? 0} color="#17236a" />

          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f0fdf4', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' }}>Total Savings</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>₱{parseFloat(sc.total_savings || 0).toLocaleString()}</div>
          </div>
          <div style={{ marginTop: '0.75rem', padding: '1rem', background: '#eff6ff', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' }}>Total Shared Capital</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#17236a' }}>₱{parseFloat(sc.total_capital || 0).toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontSize: '0.875rem', color: '#4b5563' }}>{label}</span>
      <span style={{ fontSize: '1rem', fontWeight: 700, color }}>{value}</span>
    </div>
  );
}