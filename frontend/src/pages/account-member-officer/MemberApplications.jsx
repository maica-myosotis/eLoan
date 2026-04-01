import { useState, useEffect } from 'react';
import amoService from '../../services/amo.service';

const STATUS_BADGE = {
  pending:  { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
  approved: { bg: '#d1fae5', color: '#065f46', label: 'Approved' },
  rejected: { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
};

export default function MemberApplications() {
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [modal, setModal] = useState(null); // 'detail' | 'reject'
  const [actionMsg, setActionMsg] = useState('');

  const load = async (f) => {
    setLoading(true);
    const data = await amoService.getApplications(f);
    setApplicants(data || []);
    setLoading(false);
  };

  useEffect(() => { load(filter); }, [filter]);

  const openDetail = async (id) => {
    const detail = await amoService.getApplicationDetail(id);
    setSelected(detail);
    setModal('detail');
  };

  const handleApprove = async (id) => {
    try {
      const res = await amoService.approveApplication(id);
      setActionMsg(res.message);
      setModal(null);
      load(filter);
    } catch (e) {
      setActionMsg('Failed to approve. Please try again.');
    }
  };

  const handleReject = async () => {
    try {
      const res = await amoService.rejectApplication(selected.id, rejectReason);
      setActionMsg(res.message);
      setModal(null);
      setRejectReason('');
      load(filter);
    } catch (e) {
      setActionMsg('Failed to reject. Please try again.');
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.25rem' }}>Member Applications</h1>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>Review and process applicant registrations</p>

      {actionMsg && (
        <div style={{ background: '#d1fae5', color: '#065f46', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {actionMsg}
          <button onClick={() => setActionMsg('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#065f46' }}>✕</button>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {['pending', 'approved', 'rejected', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '0.5rem 1.25rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
            background: filter === f ? '#10b981' : '#e5e7eb',
            color: filter === f ? '#fff' : '#374151',
            fontWeight: filter === f ? 600 : 400,
            fontSize: '0.875rem',
            textTransform: 'capitalize',
          }}>{f}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Name', 'Email', 'Employee ID', 'Date Applied', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '0.875rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</td></tr>
            )}
            {!loading && applicants.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>No records found.</td></tr>
            )}
            {applicants.map((a, i) => {
              const badge = STATUS_BADGE[a.account_status] || STATUS_BADGE.pending;
              return (
                <tr
                  key={a.id}
                  onClick={() => openDetail(a.id)}
                  style={{ borderTop: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa')}
                >
                  <td style={{ padding: '0.875rem 1rem', fontWeight: 500, fontSize: '0.875rem' }}>{a.name}</td>
                  <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', color: '#4b5563' }}>{a.email}</td>
                  <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', color: '#4b5563' }}>{a.employee_id || '—'}</td>
                  <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', color: '#4b5563' }}>{new Date(a.date_joined).toLocaleDateString()}</td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <span style={{ background: badge.bg, color: badge.color, padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
                      {badge.label}
                    </span>
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }} onClick={e => e.stopPropagation()}>
                    {a.account_status === 'pending' && (
                      <>
                        <button onClick={() => handleApprove(a.id)} style={{
                          background: '#d1fae5', color: '#065f46', border: 'none', padding: '0.35rem 0.75rem',
                          borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', marginRight: '0.5rem', fontWeight: 500,
                        }}>Approve</button>
                        <button onClick={() => { setSelected(a); setModal('reject'); }} style={{
                          background: '#fee2e2', color: '#991b1b', border: 'none', padding: '0.35rem 0.75rem',
                          borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 500,
                        }}>Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {modal === 'detail' && selected && (
        <ApplicationDetailModal
          data={selected}
          onClose={() => setModal(null)}
          onApprove={() => handleApprove(selected.id)}
          onReject={() => setModal('reject')}
        />
      )}

      {/* Reject Modal */}
      {modal === 'reject' && selected && (
        <Modal title="Reject Application" onClose={() => setModal(null)} maxWidth="480px">
          <p style={{ color: '#4b5563', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Rejecting: <strong>{selected.name || `${selected.firstname} ${selected.lastname}`}</strong>
          </p>
          <label style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>Reason (optional)</label>
          <textarea
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            rows={4}
            placeholder="Enter rejection reason..."
            style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleReject} style={{
              flex: 1, background: '#ef4444', color: '#fff', border: 'none', padding: '0.75rem',
              borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
            }}>Confirm Rejection</button>
            <button onClick={() => setModal(null)} style={{
              flex: 1, background: '#e5e7eb', color: '#374151', border: 'none', padding: '0.75rem',
              borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Full Application Detail Modal ──────────────────────────────────────────

function ApplicationDetailModal({ data, onClose, onApprove, onReject }) {
  const p = data.profile || {};
  const badge = STATUS_BADGE[data.account_status] || STATUS_BADGE.pending;

  return (
    <Modal title="Membership Application" onClose={onClose} maxWidth="760px">
      {/* Header: name + status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid #f3f4f6' }}>
        <div>
          <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1f2937' }}>
            {data.firstname} {p.middle_name ? p.middle_name + ' ' : ''}{data.lastname}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.2rem' }}>{data.email}</div>
        </div>
        <span style={{ background: badge.bg, color: badge.color, padding: '0.3rem 0.9rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
          {badge.label}
        </span>
      </div>

      {/* Application Status */}
      <Section title="Application Status">
        <Row2>
          <Field label="Date Applied" value={new Date(data.date_joined).toLocaleString()} />
          <Field label="Employee ID" value={data.employee_id} />
        </Row2>
        <Row2>
          <Field label="Decision Deadline" value={data.decision_deadline ? new Date(data.decision_deadline).toLocaleDateString() : null} />
          <Field label="Days Remaining" value={data.days_remaining != null ? `${data.days_remaining} day(s)` : null} />
        </Row2>
        {data.approved_at && (
          <Row2>
            <Field label="Approved At" value={new Date(data.approved_at).toLocaleString()} />
            <Field label="Approved By" value={data.approved_by} />
          </Row2>
        )}
        {data.rejection_reason && (
          <Field label="Rejection Reason" value={data.rejection_reason} full />
        )}
      </Section>

      {/* Personal Information */}
      <Section title="Personal Information">
        <Row2>
          <Field label="First Name" value={data.firstname} />
          <Field label="Middle Name" value={p.middle_name} />
        </Row2>
        <Row2>
          <Field label="Last Name" value={data.lastname} />
          <Field label="Date of Birth" value={p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString() : null} />
        </Row2>
        <Row2>
          <Field label="Gender" value={p.gender} />
          <Field label="Civil Status" value={p.civil_status} />
        </Row2>
        <Row2>
          <Field label="Citizenship" value={p.citizenship} />
          <Field label="Spouse Name" value={p.spouse_name} />
        </Row2>
        <Row2>
          <Field label="Highest Education" value={p.highest_education} />
          <Field label="TIN" value={p.tin} />
        </Row2>
        <Row2>
          <Field label="SSS Number" value={p.sss_number} />
          <Field label="Contact Number" value={p.contact_number} />
        </Row2>
        <Row2>
          <Field label="Secondary Contact" value={p.secondary_contact} />
        </Row2>
      </Section>

      {/* Present Address */}
      <Section title="Present Address">
        <Row2>
          <Field label="Street / House No." value={p.address_line1} />
          <Field label="Barangay" value={p.address_line2} />
        </Row2>
        <Row2>
          <Field label="City / Municipality" value={p.city} />
          <Field label="Province" value={p.province} />
        </Row2>
        <Row2>
          <Field label="ZIP Code" value={p.zip_code} />
        </Row2>
      </Section>

      {/* Permanent Address */}
      <Section title="Permanent Address">
        <Row2>
          <Field label="Street / House No." value={p.permanent_address_line1} />
          <Field label="Barangay" value={p.permanent_address_barangay} />
        </Row2>
        <Row2>
          <Field label="City / Municipality" value={p.permanent_city} />
          <Field label="Province" value={p.permanent_province} />
        </Row2>
        <Row2>
          <Field label="ZIP Code" value={p.permanent_zip_code} />
        </Row2>
      </Section>

      {/* Employment Information */}
      <Section title="Employment Information">
        <Row2>
          <Field label="Employment Category" value={p.employment_category} />
          <Field label="Employment Status" value={p.employment_status} />
        </Row2>
        <Row2>
          <Field label="BukSU ID Number" value={p.buksu_id_number} />
          <Field label="Office / Department" value={p.office} />
        </Row2>
        <Row2>
          <Field label="Position" value={p.position} />
          <Field label="Years Employed" value={p.years_employed != null ? String(p.years_employed) : null} />
        </Row2>
        <Row2>
          <Field label="Employer Name" value={p.employer_name} />
          <Field label="Monthly Income" value={p.monthly_income ? `₱${Number(p.monthly_income).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : null} />
        </Row2>
        <Row2>
          <Field label="Net Take-Home Pay" value={p.net_take_home_pay ? `₱${Number(p.net_take_home_pay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : null} />
        </Row2>
        {p.employer_address && <Field label="Employer Address" value={p.employer_address} full />}
      </Section>

      {/* Parents / Family Background */}
      <Section title="Family Background">
        <Row2>
          <Field label="Father's Name" value={p.father_name} />
          <Field label="Father's Occupation" value={p.father_occupation} />
        </Row2>
        <Row2>
          <Field label="Father's Contact" value={p.father_contact} />
        </Row2>
        <Row2>
          <Field label="Mother's Name" value={p.mother_name} />
          <Field label="Mother's Occupation" value={p.mother_occupation} />
        </Row2>
        <Row2>
          <Field label="Mother's Contact" value={p.mother_contact} />
        </Row2>
      </Section>

      {/* Emergency Contact */}
      <Section title="Emergency Contact">
        <Row2>
          <Field label="Name" value={p.emergency_contact_name} />
          <Field label="Relationship" value={p.emergency_contact_relationship} />
        </Row2>
        <Row2>
          <Field label="Contact Number" value={p.emergency_contact_number} />
        </Row2>
      </Section>

      {/* Beneficiaries */}
      <Section title="Beneficiaries">
        {(!data.beneficiaries || data.beneficiaries.length === 0) ? (
          <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>No beneficiaries declared.</p>
        ) : (
          data.beneficiaries.map((b, i) => (
            <div key={i} style={{ background: '#f9fafb', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1f2937', marginBottom: '0.4rem' }}>Beneficiary {i + 1}</div>
              <Row2>
                <Field label="Name" value={b.name} />
                <Field label="Relationship" value={b.relationship} />
              </Row2>
              <Row2>
                <Field label="Date of Birth" value={b.date_of_birth ? new Date(b.date_of_birth).toLocaleDateString() : null} />
                <Field label="Contact Number" value={b.contact_number} />
              </Row2>
            </div>
          ))
        )}
      </Section>

      {/* Documents */}
      <Section title="Submitted Documents">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <DocLink label="ID Photo" url={p.id_photo} />
          <DocLink label="Payslip" url={p.payslip} />
          <DocLink label="Certificate of Employment" url={p.coe_document} />
        </div>
      </Section>

      {/* Actions */}
      {data.account_status === 'pending' && (
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
          <button onClick={onApprove} style={{
            flex: 1, background: '#10b981', color: '#fff', border: 'none', padding: '0.75rem',
            borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
          }}>Approve Application</button>
          <button onClick={onReject} style={{
            flex: 1, background: '#ef4444', color: '#fff', border: 'none', padding: '0.75rem',
            borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
          }}>Reject Application</button>
        </div>
      )}
    </Modal>
  );
}

// ─── Helper Components ───────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{
        fontSize: '0.7rem', fontWeight: 700, color: '#17236a', textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: '0.75rem', paddingBottom: '0.4rem',
        borderBottom: '2px solid #e0e7ff',
      }}>{title}</div>
      {children}
    </div>
  );
}

function Row2({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1.5rem', marginBottom: '0.5rem' }}>
      {children}
    </div>
  );
}

function Field({ label, value, full }) {
  const content = (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '0.875rem', color: value ? '#1f2937' : '#d1d5db', marginTop: '0.1rem', wordBreak: 'break-word' }}>
        {value || '—'}
      </div>
    </div>
  );
  return full ? <div style={{ gridColumn: '1 / -1' }}>{content}</div> : content;
}

function DocLink({ label, url }) {
  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.75rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
    }}>
      <span style={{ fontSize: '0.8rem', color: '#374151', fontWeight: 500 }}>{label}</span>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" style={{
          fontSize: '0.75rem', color: '#17236a', fontWeight: 600, textDecoration: 'none',
          background: '#e0e7ff', padding: '0.2rem 0.6rem', borderRadius: '6px',
        }}>View</a>
      ) : (
        <span style={{ fontSize: '0.75rem', color: '#d1d5db' }}>Not submitted</span>
      )}
    </div>
  );
}

function Modal({ title, children, onClose, maxWidth = '480px' }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1f2937' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '1.25rem' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
