import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import creditCommitteeService from '../../services/creditCommittee.service';

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Decision form state
  const [decision, setDecision] = useState('');
  const [remarks, setRemarks] = useState('');
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchApplication();
  }, [id]);

  const fetchApplication = async () => {
    try {
      setLoading(true);
      const result = await creditCommitteeService.getApplication(id);
      setData(result);
    } catch (err) {
      setError('Failed to load application');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitDecision = async (e) => {
    e.preventDefault();

    if (!decision) {
      alert('Please select a decision');
      return;
    }
    if (!remarks.trim()) {
      alert('Remarks are required');
      return;
    }
    if (!meetingDate) {
      alert('Meeting date is required');
      return;
    }

    const decisionText = {
      approved: 'APPROVE',
      rejected: 'REJECT',
      returned: 'RETURN TO TREASURER'
    };

    if (!confirm(`Are you sure you want to ${decisionText[decision]} this application?`)) {
      return;
    }

    try {
      setSubmitting(true);
      await creditCommitteeService.submitDecision(id, decision, remarks, meetingDate);
      alert('Decision submitted successfully');
      navigate('/credit-committee/applications');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit decision');
      console.error(err);
    } finally {
      setSubmitting(false);
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
        <button onClick={fetchApplication} style={{ marginLeft: '1rem', textDecoration: 'underline' }}>
          Retry
        </button>
      </div>
    );
  }

  const { application, financial_assessment, documents, comakers, committee_member, can_decide } = data;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937', marginBottom: '0.25rem' }}>
            Application #{application.id}
          </h1>
          <span style={{
            background: '#fef3c7',
            color: '#92400e',
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 500,
          }}>
            {application.status}
          </span>
        </div>
        <button
          onClick={() => navigate('/credit-committee/applications')}
          style={{
            background: '#f3f4f6',
            color: '#374151',
            padding: '0.5rem 1rem',
            borderRadius: '0.375rem',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          &larr; Back to Applications
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: can_decide ? '2fr 1fr' : '1fr', gap: '1.5rem' }}>
        {/* Main Content */}
        <div>
          {/* Applicant Information */}
          <Card title="A. Applicant Information">
            <InfoRow label="Full Name" value={application.applicant.name} />
            <InfoRow label="Email" value={application.applicant.email} />
            <InfoRow label="Member Since" value={new Date(application.applicant.date_joined).toLocaleDateString()} />
            <InfoRow label="Status" value={application.applicant.status} />
          </Card>

          {/* Loan Details */}
          <Card title="B. Loan Details">
            <InfoRow label="Loan Type" value={application.loan_type.name} />
            <InfoRow label="Amount Requested" value={`₱${parseFloat(application.amount_requested).toLocaleString()}`} highlight />
            <InfoRow label="Term" value={`${application.term_months} months`} />
            <InfoRow label="Interest Rate" value={`${application.loan_type.interest_rate}%`} />
            <InfoRow label="Monthly Amortization" value={application.monthly_amortization ? `₱${parseFloat(application.monthly_amortization).toLocaleString()}` : 'N/A'} />
            <InfoRow label="Total Payable" value={application.total_payable ? `₱${parseFloat(application.total_payable).toLocaleString()}` : 'N/A'} />
            <InfoRow label="Purpose" value={application.purpose} />
          </Card>

          {/* Financial Assessment */}
          {financial_assessment && (
            <Card title="C. Financial Assessment Summary" badge="Read Only">
              <InfoRow label="Net Salary" value={`₱${parseFloat(financial_assessment.net_salary).toLocaleString()}`} />
              <InfoRow label="Monthly Amortization" value={`₱${parseFloat(financial_assessment.monthly_amortization).toLocaleString()}`} />
              <InfoRow label="DTI Ratio" value={`${parseFloat(financial_assessment.dti_ratio).toFixed(2)}%`} highlight />
              <InfoRow label="Risk Level">
                <RiskBadge level={financial_assessment.risk_level} />
              </InfoRow>
              <InfoRow label="Treasurer Recommendation">
                <span style={{
                  background: financial_assessment.treasurer_recommendation === 'recommend' ? '#d1fae5' : '#fee2e2',
                  color: financial_assessment.treasurer_recommendation === 'recommend' ? '#065f46' : '#991b1b',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                }}>
                  {financial_assessment.treasurer_recommendation === 'recommend' ? 'Recommended' : 'Not Recommended'}
                </span>
              </InfoRow>
              {financial_assessment.treasurer_remarks && (
                <InfoRow label="Treasurer Remarks" value={financial_assessment.treasurer_remarks} />
              )}
              <InfoRow label="Evaluated By" value={financial_assessment.evaluated_by} />
              <InfoRow label="Evaluation Date" value={new Date(financial_assessment.evaluated_at).toLocaleString()} />
            </Card>
          )}

          {/* Documents */}
          <Card title="D. Uploaded Documents" badge="View Only">
            {documents.length === 0 ? (
              <div style={{ color: '#6b7280', padding: '1rem 0' }}>No documents uploaded</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', fontSize: '0.75rem', color: '#6b7280' }}>Type</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', fontSize: '0.75rem', color: '#6b7280' }}>Uploaded</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', fontSize: '0.75rem', color: '#6b7280' }}>Verified</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', fontSize: '0.75rem', color: '#6b7280' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.75rem 0', fontSize: '0.875rem' }}>{doc.document_type}</td>
                      <td style={{ padding: '0.75rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                        {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'N/A'}
                      </td>
                      <td style={{ padding: '0.75rem 0' }}>
                        {doc.verified ? (
                          <span style={{ color: '#10b981' }}>&#10004; Yes</span>
                        ) : (
                          <span style={{ color: '#6b7280' }}>Pending</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 0' }}>
                        <button
                          onClick={() => window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/media/${doc.file_path}`, '_blank')}
                          style={{
                            background: '#8b5cf6',
                            color: 'white',
                            border: 'none',
                            padding: '0.375rem 0.75rem',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                          }}
                          onMouseOver={(e) => e.target.style.background = '#7c3aed'}
                          onMouseOut={(e) => e.target.style.background = '#8b5cf6'}
                        >
                          &#128065; View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Co-makers */}
          {comakers.length > 0 && (
            <Card title="E. Co-makers">
              {comakers.map((cm) => (
                <div key={cm.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 500 }}>{cm.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{cm.email}</div>
                  <div style={{ fontSize: '0.75rem', color: '#10b981' }}>
                    Agreed: {new Date(cm.agreed_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* Decision Panel */}
        {can_decide && (
          <div>
            <Card title="Decision Section" highlight>
              <form onSubmit={handleSubmitDecision}>
                {/* Decision Options */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.75rem', color: '#374151' }}>
                    Decision *
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: decision === 'approved' ? '2px solid #10b981' : '1px solid #e5e7eb',
                      background: decision === 'approved' ? '#f0fdf4' : '#fff',
                      cursor: 'pointer',
                    }}>
                      <input
                        type="radio"
                        name="decision"
                        value="approved"
                        checked={decision === 'approved'}
                        onChange={(e) => setDecision(e.target.value)}
                        style={{ marginRight: '0.75rem' }}
                      />
                      <span style={{ fontWeight: 500, color: '#065f46' }}>&#10004; Approve</span>
                    </label>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: decision === 'rejected' ? '2px solid #ef4444' : '1px solid #e5e7eb',
                      background: decision === 'rejected' ? '#fef2f2' : '#fff',
                      cursor: 'pointer',
                    }}>
                      <input
                        type="radio"
                        name="decision"
                        value="rejected"
                        checked={decision === 'rejected'}
                        onChange={(e) => setDecision(e.target.value)}
                        style={{ marginRight: '0.75rem' }}
                      />
                      <span style={{ fontWeight: 500, color: '#991b1b' }}>&#10006; Reject</span>
                    </label>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: decision === 'returned' ? '2px solid #17236a' : '1px solid #e5e7eb',
                      background: decision === 'returned' ? '#eef2ff' : '#fff',
                      cursor: 'pointer',
                    }}>
                      <input
                        type="radio"
                        name="decision"
                        value="returned"
                        checked={decision === 'returned'}
                        onChange={(e) => setDecision(e.target.value)}
                        style={{ marginRight: '0.75rem' }}
                      />
                      <span style={{ fontWeight: 500, color: '#4338ca' }}>&#8634; Return to Treasurer</span>
                    </label>
                  </div>
                </div>

                {/* Remarks */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem', color: '#374151' }}>
                    Remarks *
                  </label>
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    rows={4}
                    placeholder="Provide detailed remarks explaining your decision..."
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                      fontSize: '0.875rem',
                      resize: 'vertical',
                    }}
                    required
                  />
                </div>

                {/* Meeting Date */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem', color: '#374151' }}>
                    Meeting Date *
                  </label>
                  <input
                    type="date"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                      fontSize: '0.875rem',
                    }}
                    required
                  />
                </div>

                {/* Committee Member */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem', color: '#374151' }}>
                    Committee Member
                  </label>
                  <input
                    type="text"
                    value={committee_member.name}
                    readOnly
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                      fontSize: '0.875rem',
                      background: '#f9fafb',
                      color: '#6b7280',
                    }}
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: '100%',
                    background: '#8b5cf6',
                    color: '#fff',
                    padding: '0.875rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '1rem',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? 'Submitting...' : 'Submit Decision'}
                </button>
              </form>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ title, badge, highlight, children }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '0.75rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      marginBottom: '1rem',
      border: highlight ? '2px solid #8b5cf6' : 'none',
    }}>
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: highlight ? '#f5f3ff' : 'transparent',
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
          {title}
        </h3>
        {badge && (
          <span style={{
            background: '#f3f4f6',
            color: '#6b7280',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.25rem',
            fontSize: '0.75rem',
          }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{ padding: '1rem 1.5rem' }}>
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, value, highlight, children }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0.5rem 0',
      borderBottom: '1px solid #f3f4f6',
    }}>
      <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{label}</span>
      {children || (
        <span style={{
          fontWeight: highlight ? 600 : 400,
          color: highlight ? '#8b5cf6' : '#1f2937',
          fontSize: '0.875rem',
        }}>
          {value}
        </span>
      )}
    </div>
  );
}

function RiskBadge({ level }) {
  const styles = {
    Low: { background: '#d1fae5', color: '#065f46' },
    Medium: { background: '#fef3c7', color: '#92400e' },
    High: { background: '#fee2e2', color: '#991b1b' },
  };

  return (
    <span style={{
      ...styles[level] || styles.Medium,
      padding: '0.25rem 0.75rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: 500,
    }}>
      {level} Risk
    </span>
  );
}
