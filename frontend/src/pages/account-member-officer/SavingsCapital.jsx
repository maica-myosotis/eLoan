import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import amoService from '../../services/amo.service';

const TABS = ['savings', 'capital'];

export default function SavingsCapital() {
  const [searchParams] = useSearchParams();
  const initMemberId = searchParams.get('member') || '';

  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState(initMemberId);
  const [memberInfo, setMemberInfo] = useState(null);
  const [tab, setTab] = useState('savings');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: '', transaction_type: 'deposit', reference_number: '', remarks: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    amoService.getMembers().then(d => setMembers(d || []));
  }, []);

  useEffect(() => {
    if (memberId) loadRecords();
  }, [memberId, tab]);

  // Reset transaction_type default when switching tabs
  useEffect(() => {
    setForm(prev => ({ ...prev, transaction_type: tab === 'savings' ? 'deposit' : 'contribution' }));
    setShowForm(false);
  }, [tab]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      if (tab === 'savings') {
        const [recs, info] = await Promise.all([amoService.getMemberSavings(memberId), amoService.getMemberDetail(memberId)]);
        setRecords(recs || []);
        setMemberInfo(info);
      } else {
        const [recs, info] = await Promise.all([amoService.getMemberCapital(memberId), amoService.getMemberDetail(memberId)]);
        setRecords(recs || []);
        setMemberInfo(info);
      }
    } catch { setRecords([]); }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (tab === 'savings') {
        await amoService.addSavings(memberId, form);
      } else {
        await amoService.addCapital(memberId, form);
      }
      setMsg('Record added successfully.');
      setShowForm(false);
      setForm({ amount: '', transaction_type: tab === 'savings' ? 'deposit' : 'contribution', reference_number: '', remarks: '' });
      loadRecords();
    } catch {
      setMsg('Failed to add record.');
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.25rem' }}>Savings & Capital</h1>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>Manage member savings and shared capital contributions</p>

      {msg && (
        <div style={{ background: '#d1fae5', color: '#065f46', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {msg}<button onClick={() => setMsg('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Member Selector */}
      <div style={{ background: '#fff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.5rem' }}>
        <label style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.5rem', display: 'block' }}>Select Member</label>
        <select
          value={memberId}
          onChange={e => setMemberId(e.target.value)}
          style={{ width: '100%', padding: '0.625rem 1rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
        >
          <option value="">-- Choose a member --</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
          ))}
        </select>
        {memberInfo && (
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Total Savings: <strong style={{ color: '#10b981' }}>₱{parseFloat(memberInfo.total_savings).toLocaleString()}</strong></span>
            <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Total Capital: <strong style={{ color: '#17236a' }}>₱{parseFloat(memberInfo.total_shared_capital).toLocaleString()}</strong></span>
            <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Membership: <strong>{memberInfo.membership_type}</strong></span>
          </div>
        )}
      </div>

      {memberId && (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); setShowForm(false); }} style={{
                padding: '0.5rem 1.5rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
                background: tab === t ? '#10b981' : '#e5e7eb',
                color: tab === t ? '#fff' : '#374151',
                fontWeight: tab === t ? 600 : 400,
                fontSize: '0.875rem',
                textTransform: 'capitalize',
              }}>{t}</button>
            ))}
            <button onClick={() => setShowForm(!showForm)} style={{
              marginLeft: 'auto', background: '#1f2937', color: '#fff', border: 'none',
              padding: '0.5rem 1.25rem', borderRadius: '9999px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
            }}>+ Add Entry</button>
          </div>

          {/* Add Form */}
          {showForm && (
            <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#1f2937' }}>
                Add {tab === 'savings' ? 'Savings' : 'Capital'} Entry
              </h3>
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Amount (₱)</label>
                    <input required type="number" min="0.01" step="0.01" value={form.amount}
                      onChange={e => setForm({ ...form, amount: e.target.value })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Type</label>
                    <select value={form.transaction_type} onChange={e => setForm({ ...form, transaction_type: e.target.value })} style={inputStyle}>
                      {tab === 'savings'
                        ? <><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option></>
                        : <><option value="contribution">Contribution</option><option value="withdrawal">Withdrawal</option></>
                      }
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Reference Number</label>
                    <input required value={form.reference_number} onChange={e => setForm({ ...form, reference_number: e.target.value })} style={inputStyle} placeholder="e.g. OR-2024-001" />
                  </div>
                  <div>
                    <label style={labelStyle}>Remarks</label>
                    <input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} style={inputStyle} placeholder="Optional" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  <button type="submit" style={{ background: '#10b981', color: '#fff', border: 'none', padding: '0.625rem 1.5rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                  <button type="button" onClick={() => setShowForm(false)} style={{ background: '#e5e7eb', color: '#374151', border: 'none', padding: '0.625rem 1.5rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {/* Records Table */}
          <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Date', 'Type', 'Amount', 'Reference', 'Remarks', 'Recorded By'].map(h => (
                    <th key={h} style={{ padding: '0.875rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</td></tr>}
                {!loading && records.length === 0 && <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>No records found.</td></tr>}
                {records.map((r, i) => {
                  const isNeg = parseFloat(r.amount) < 0;
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem' }}>{new Date(r.recorded_at).toLocaleDateString()}</td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span style={{
                          background: isNeg ? '#fee2e2' : '#d1fae5',
                          color: isNeg ? '#991b1b' : '#065f46',
                          padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600,
                        }}>{r.transaction_type}</span>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', fontWeight: 600, color: isNeg ? '#ef4444' : '#10b981' }}>
                        {isNeg ? '' : '+'}₱{Math.abs(parseFloat(r.amount)).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', color: '#4b5563' }}>{r.reference_number || '—'}</td>
                      <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', color: '#4b5563' }}>{r.remarks || '—'}</td>
                      <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', color: '#4b5563' }}>{r.recorded_by || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: 500, color: '#374151', marginBottom: '0.4rem' };
const inputStyle = { width: '100%', padding: '0.625rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box' };