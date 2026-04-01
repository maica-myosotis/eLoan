import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import amoService from '../../services/amo.service';

const StatCard = ({ label, value, color, icon, path }) => {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => path && navigate(path)}
      style={{
        background: '#fff', borderRadius: '12px', padding: '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: `4px solid ${color}`,
        display: 'flex', alignItems: 'center', gap: '1rem',
        cursor: path ? 'pointer' : 'default', transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={path ? e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)') : undefined}
      onMouseLeave={path ? e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)') : undefined}
    >
      <div style={{ fontSize: '2rem' }}>{icon}</div>
      <div>
        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#02327a' }}>{value}</div>
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{label}</div>
      </div>
    </div>
  );
};

export default function AMODashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    amoService.getDashboard().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;

  const stats = data?.stats || {};

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.25rem' }}>Dashboard</h1>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>Overview of member management activities</p>

      {/* New Applicant Alert */}
      {(stats.pending_applications ?? 0) > 0 && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fcd34d', borderLeft: '4px solid #f59e0b',
          borderRadius: '10px', padding: '0.875rem 1.25rem', marginBottom: '1.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>👤</span>
            <div>
              <span style={{ fontWeight: 600, color: '#92400e', fontSize: '0.9rem' }}>
                {stats.pending_applications} new applicant{stats.pending_applications > 1 ? 's' : ''} awaiting approval
              </span>
              <div style={{ fontSize: '0.775rem', color: '#b45309', marginTop: '0.1rem' }}>
                Review and approve or reject from Member Applications.
              </div>
            </div>
          </div>
          <Link to="/amo/applications" style={{
            background: '#f59e0b', color: '#fff', padding: '0.4rem 1rem',
            borderRadius: '8px', fontSize: '0.8rem', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap',
          }}>Review Now</Link>
        </div>
      )}

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <StatCard label="Pending Applications" value={stats.pending_applications ?? 0} color="#f59e0b" icon="📋" path="/amo/applications" />
        <StatCard label="Total Members" value={stats.total_members ?? 0} color="#10b981" icon="👥" path="/amo/members" />
        <StatCard label="Approved This Week" value={stats.recently_approved ?? 0} color="#17236a" icon="✅" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Pending Applicants */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1f2937' }}>Pending Applications</h2>
            <Link to="/amo/applications" style={{ fontSize: '0.8rem', color: '#10b981', textDecoration: 'none' }}>View all</Link>
          </div>
          {(data?.recent_applicants?.length === 0) && (
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No pending applications.</p>
          )}
          {data?.recent_applicants?.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid #f3f4f6' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#1f2937' }}>{a.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{a.email}</div>
              </div>
              <Link to={`/amo/applications?id=${a.id}`} style={{
                background: '#fef3c7', color: '#92400e', padding: '0.25rem 0.75rem',
                borderRadius: '9999px', fontSize: '0.75rem', textDecoration: 'none', fontWeight: 500,
              }}>Pending</Link>
            </div>
          ))}
        </div>

        {/* Recent Members */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1f2937' }}>Recent Members</h2>
            <Link to="/amo/members" style={{ fontSize: '0.8rem', color: '#10b981', textDecoration: 'none' }}>View all</Link>
          </div>
          {(data?.recent_members?.length === 0) && (
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No members yet.</p>
          )}
          {data?.recent_members?.map(m => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid #f3f4f6' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#1f2937' }}>{m.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Since {new Date(m.member_since).toLocaleDateString()}</div>
              </div>
              <span style={{
                background: m.membership_type === 'regular' ? '#d1fae5' : '#ede9fe',
                color: m.membership_type === 'regular' ? '#065f46' : '#5b21b6',
                padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 500,
              }}>
                {m.membership_type === 'regular' ? 'Regular' : 'Associate'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}