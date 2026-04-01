import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import bookkeeperService from '../../services/bookkeeper.service';

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [notes, setNotes] = useState('');
  const [disbursementNotes, setDisbursementNotes] = useState('');
  const [recordingDisbursement, setRecordingDisbursement] = useState(false);
  const [disbursementRecorded, setDisbursementRecorded] = useState(false);
  const [disbursementError, setDisbursementError] = useState('');

  useEffect(() => {
    fetchApplication();
  }, [id]);

  const fetchApplication = async () => {
    try {
      setLoading(true);
      const result = await bookkeeperService.getApplication(id);
      setData(result);
    } catch (err) {
      setError('Failed to load application');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!window.confirm('Are you sure you want to verify this application?')) return;
    try {
      setProcessing(true);
      await bookkeeperService.verifyApplication(id, notes);
      alert('Application verified successfully!');
      navigate('/bookkeeper/applications');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to verify application');
    } finally {
      setProcessing(false);
    }
  };

  const handleRecordDisbursement = async () => {
    setRecordingDisbursement(true);
    setDisbursementError('');
    try {
      await bookkeeperService.recordDisbursement(id, disbursementNotes);
      setDisbursementRecorded(true);
      setDisbursementNotes('');
      await fetchApplication();
    } catch (err) {
      setDisbursementError(err?.response?.data?.error || 'Failed to record disbursement.');
    } finally {
      setRecordingDisbursement(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }
    try {
      setProcessing(true);
      await bookkeeperService.rejectApplication(id, rejectionReason, notes);
      alert('Application rejected successfully!');
      navigate('/bookkeeper/applications');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reject application');
    } finally {
      setProcessing(false);
      setShowRejectModal(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>Loading application...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ background: '#fee2e2', color: '#dc2626', padding: '1rem', borderRadius: '0.5rem' }}>
        {error || 'Application not found'}
        <Link to="/bookkeeper/applications" style={{ marginLeft: '1rem', textDecoration: 'underline' }}>
          Back to Applications
        </Link>
      </div>
    );
  }

  const { application, personal_details, documents, comakers, verification_history, face_verification, liveness_check, can_review } = data;

  const mediaBase = new URL(import.meta.env.VITE_API_URL || 'http://localhost:8000').origin;

  return (
    <div>
      {/* Back Button */}
      <Link
        to="/bookkeeper/applications"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: '#6b7280', textDecoration: 'none', marginBottom: '1rem' }}
      >
        &larr; Back to Applications
      </Link>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Main Content */}
        <div>
          {/* Loan Information */}
          <Card title={`Application #${application.id}`} badge={application.status}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <SectionLabel>Loan Information</SectionLabel>
                <InfoRow label="Loan Type" value={application.loan_type.name} />
                <InfoRow label="Amount Requested" value={`&#8369;${parseFloat(application.amount_requested).toLocaleString()}`} highlight />
                <InfoRow label="Term" value={`${application.term_months} months`} />
                <InfoRow label="Interest Rate" value={`${application.loan_type.interest_rate}%`} />
                <InfoRow label="Monthly Amortization" value={application.monthly_amortization ? `&#8369;${parseFloat(application.monthly_amortization).toLocaleString()}` : 'N/A'} />
                <InfoRow label="Total Payable" value={application.total_payable ? `&#8369;${parseFloat(application.total_payable).toLocaleString()}` : 'N/A'} />
              </div>
              <div>
                <SectionLabel>Application Details</SectionLabel>
                <InfoRow label="Application Date" value={formatDateTime(application.application_date)} />
                <InfoRow label="Purpose" value={application.purpose || 'Not specified'} />
              </div>
            </div>
          </Card>

          {/* Loan-Type-Specific Fields */}
          {application.loan_form_data && Object.keys(application.loan_form_data).length > 0 && (
            <Card title="Loan-Specific Details" style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2rem' }}>
                {Object.entries(application.loan_form_data).map(([key, value]) => (
                  <InfoRow
                    key={key}
                    label={key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    value={value != null ? String(value) : '—'}
                  />
                ))}
              </div>
            </Card>
          )}

          {/* Applicant Information */}
          <Card title="Applicant Information" style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{
                width: '60px', height: '60px', background: '#17236a', color: '#fff',
                borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: 600, fontSize: '1.5rem',
              }}>
                {application.applicant.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{application.applicant.name}</h3>
                <div style={{ color: '#6b7280' }}>{application.applicant.email}</div>
              </div>
            </div>
            <InfoRow label="Account Status">
              <span style={{
                background: application.applicant.status === 'active' ? '#d1fae5' : '#fee2e2',
                color: application.applicant.status === 'active' ? '#065f46' : '#991b1b',
                padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem',
              }}>
                {application.applicant.status}
              </span>
            </InfoRow>
            <InfoRow label="Member Since" value={formatDate(application.applicant.date_joined)} />
          </Card>

          {/* Personal Details */}
          {personal_details && (
            <Card title="Personal Details" style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2rem' }}>
                <div>
                  <SectionLabel>Contact & Identity</SectionLabel>
                  <InfoRow label="Contact Number" value={personal_details.contact_number || '—'} />
                  <InfoRow label="Secondary Contact" value={personal_details.secondary_contact || '—'} />
                  <InfoRow label="Civil Status" value={capitalize(personal_details.civil_status)} />
                  <InfoRow label="Gender" value={capitalize(personal_details.gender)} />
                  <InfoRow label="Date of Birth" value={personal_details.date_of_birth ? formatDate(personal_details.date_of_birth) : '—'} />
                  <InfoRow label="Highest Education" value={personal_details.highest_education?.replace(/_/g, ' ') || '—'} />
                  <InfoRow label="TIN" value={personal_details.tin || '—'} />
                  <InfoRow label="SSS Number" value={personal_details.sss_number || '—'} />
                </div>
                <div>
                  <SectionLabel>Address</SectionLabel>
                  <InfoRow label="Present Address" value={personal_details.present_address || '—'} />
                  <InfoRow label="Permanent Address" value={personal_details.permanent_address || '—'} />

                  <SectionLabel style={{ marginTop: '1rem' }}>Emergency Contact</SectionLabel>
                  <InfoRow label="Name" value={personal_details.emergency_contact_name || '—'} />
                  <InfoRow label="Contact Number" value={personal_details.emergency_contact_number || '—'} />
                  <InfoRow label="Relationship" value={personal_details.emergency_contact_relationship || '—'} />
                </div>
              </div>

              <div style={{ marginTop: '1rem', borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>
                <SectionLabel>Employment Information</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2rem' }}>
                  <div>
                    <InfoRow label="Employer" value={personal_details.employer_name || '—'} />
                    <InfoRow label="Employer Address" value={personal_details.employer_address || '—'} />
                    <InfoRow label="Position / Title" value={personal_details.position || '—'} />
                    <InfoRow label="BukSU ID Number" value={personal_details.buksu_id_number || '—'} />
                  </div>
                  <div>
                    <InfoRow label="Employment Category" value={capitalize(personal_details.employment_category)} />
                    <InfoRow label="Employment Status" value={capitalize(personal_details.employment_status)} />
                    <InfoRow label="Years Employed" value={personal_details.years_employed != null ? String(personal_details.years_employed) : '—'} />
                    <InfoRow label="Monthly Income" value={personal_details.monthly_income ? `&#8369;${parseFloat(personal_details.monthly_income).toLocaleString()}` : '—'} />
                    <InfoRow label="Net Take-Home Pay" value={personal_details.net_take_home_pay ? `&#8369;${parseFloat(personal_details.net_take_home_pay).toLocaleString()}` : '—'} />
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Identity Verification */}
          <Card title="Identity Verification" style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              {/* Face Verification */}
              <div>
                <SectionLabel>Face Verification</SectionLabel>
                {face_verification ? (
                  <>
                    <StatusBadge
                      label={face_verification.verification_status}
                      color={face_verification.verification_status === 'Verified' ? 'green'
                        : face_verification.verification_status === 'Needs Review' ? 'yellow'
                        : 'red'}
                    />
                    <InfoRow label="Similarity Score" value={face_verification.similarity_score ? `${parseFloat(face_verification.similarity_score).toFixed(1)}%` : '—'} />
                    <InfoRow label="Is Match" value={face_verification.is_match ? 'Yes' : 'No'} />
                    <InfoRow label="Model Used" value={face_verification.comparison_model || '—'} />
                    <InfoRow label="Processed At" value={formatDateTime(face_verification.processed_at)} />
                    {face_verification.error_message && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#dc2626', background: '#fee2e2', padding: '0.5rem', borderRadius: '0.375rem' }}>
                        {face_verification.error_message}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                      {face_verification.selfie_url && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Selfie</div>
                          <img
                            src={face_verification.selfie_url}
                            alt="Selfie"
                            style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #e5e7eb', cursor: 'pointer' }}
                            onClick={() => window.open(face_verification.selfie_url, '_blank')}
                          />
                        </div>
                      )}
                      {face_verification.id_photo_url && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>ID Photo</div>
                          <img
                            src={face_verification.id_photo_url}
                            alt="ID Photo"
                            style={{ width: '90px', height: '90px', borderRadius: '0.5rem', objectFit: 'cover', border: '2px solid #e5e7eb', cursor: 'pointer' }}
                            onClick={() => window.open(face_verification.id_photo_url, '_blank')}
                          />
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No face verification on record</div>
                )}
              </div>

              {/* Liveness Check */}
              <div>
                <SectionLabel>Liveness Check</SectionLabel>
                {liveness_check ? (
                  <>
                    <StatusBadge
                      label={liveness_check.check_status}
                      color={liveness_check.check_status === 'Verified' ? 'green' : 'red'}
                    />
                    <InfoRow label="Method" value={liveness_check.method || '—'} />
                    <InfoRow label="Confidence" value={liveness_check.confidence_score ? `${parseFloat(liveness_check.confidence_score).toFixed(1)}%` : '—'} />
                    <InfoRow label="Verified At" value={formatDateTime(liveness_check.verified_at)} />
                  </>
                ) : (
                  <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No liveness check on record</div>
                )}
              </div>
            </div>
          </Card>

          {/* Documents */}
          <Card title="Uploaded Documents" badge={`${documents.length} files`} style={{ marginTop: '1.5rem' }}>
            {documents.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>No documents uploaded</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={thStyle}>Document Type</th>
                    <th style={thStyle}>Uploaded</th>
                    <th style={thStyle}>Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => {
                    const fileUrl = `${mediaBase}/media/${doc.file_path}`;
                    return (
                      <tr
                        key={doc.id}
                        onClick={() => window.open(fileUrl, '_blank')}
                        style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                        title="Click to open document"
                      >
                        <td style={tdStyle}>&#128196; {doc.document_type}</td>
                        <td style={tdStyle}>{formatDateTime(doc.uploaded_at)}</td>
                        <td style={tdStyle}>
                          <span style={{
                            background: doc.verified ? '#d1fae5' : '#fef3c7',
                            color: doc.verified ? '#065f46' : '#92400e',
                            padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem',
                          }}>
                            {doc.verified ? 'Verified' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          {/* Co-makers */}
          {comakers.length > 0 && (
            <Card title={`Co-Makers (${comakers.length})`} style={{ marginTop: '1.5rem' }}>
              {comakers.map((cm, idx) => (
                <div key={cm.id} style={{ borderBottom: idx < comakers.length - 1 ? '1px solid #f3f4f6' : 'none', paddingBottom: '1rem', marginBottom: idx < comakers.length - 1 ? '1rem' : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{
                      width: '36px', height: '36px', background: '#17236a', color: '#fff',
                      borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '0.875rem',
                    }}>{idx + 1}</div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{cm.name}</div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{cm.email}</div>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#6b7280' }}>
                      Agreed: {formatDateTime(cm.agreed_at)}
                    </div>
                  </div>
                  {cm.detailed_info && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2rem', paddingLeft: '3rem' }}>
                      <div>
                        <InfoRow label="Relationship" value={cm.detailed_info.relationship || '—'} />
                        <InfoRow label="Contact Number" value={cm.detailed_info.contact_number || '—'} />
                        <InfoRow label="Address" value={cm.detailed_info.address || '—'} />
                      </div>
                      <div>
                        <InfoRow label="Employer" value={cm.detailed_info.employer_name || '—'} />
                        <InfoRow label="Position" value={cm.detailed_info.position || '—'} />
                        <InfoRow label="Monthly Income" value={cm.detailed_info.monthly_income ? `&#8369;${parseFloat(cm.detailed_info.monthly_income).toLocaleString()}` : '—'} />
                        <InfoRow label="ID Type" value={cm.detailed_info.id_type?.replace(/_/g, ' ') || '—'} />
                        <InfoRow label="ID Number" value={cm.detailed_info.id_number || '—'} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </Card>
          )}

          {/* Verification History */}
          {verification_history.length > 0 && (
            <Card title="Verification History" style={{ marginTop: '1.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={thStyle}>Action</th>
                    <th style={thStyle}>Verified By</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {verification_history.map((v) => (
                    <tr key={v.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={tdStyle}>
                        <span style={{
                          background: v.action === 'verified' ? '#d1fae5' : '#fee2e2',
                          color: v.action === 'verified' ? '#065f46' : '#991b1b',
                          padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem',
                        }}>
                          {v.action === 'verified' ? 'Verified' : 'Rejected'}
                        </span>
                      </td>
                      <td style={tdStyle}>{v.verified_by}</td>
                      <td style={tdStyle}>{formatDateTime(v.verified_at)}</td>
                      <td style={tdStyle}>
                        {v.rejection_reason && <><strong>Reason:</strong> {v.rejection_reason}<br /></>}
                        {v.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div>
          {can_review ? (
            <>
              <Card title="Verify Application" headerColor="#10b981">
                <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  Verifying this application will forward it to the Treasurer for further review.
                </p>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    Notes (Optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any notes for the Treasurer..."
                    rows={2}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', resize: 'none' }}
                  />
                </div>
                <button
                  onClick={handleVerify}
                  disabled={processing}
                  style={{
                    width: '100%', background: '#10b981', color: '#fff', padding: '0.75rem',
                    border: 'none', borderRadius: '0.375rem', fontWeight: 600,
                    cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.7 : 1,
                  }}
                >
                  {processing ? 'Processing...' : '&#10004; Verify & Forward to Treasurer'}
                </button>
              </Card>

              <Card title="Reject Application" headerColor="#ef4444" style={{ marginTop: '1rem' }}>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  Rejecting will notify the applicant with your rejection reason.
                </p>
                <button
                  onClick={() => setShowRejectModal(true)}
                  disabled={processing}
                  style={{
                    width: '100%', background: '#ef4444', color: '#fff', padding: '0.75rem',
                    border: 'none', borderRadius: '0.375rem', fontWeight: 600,
                    cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.7 : 1,
                  }}
                >
                  &#10006; Reject Application
                </button>
              </Card>
            </>
          ) : (
            <>
              <Card title="Application Status">
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  {application.status.includes('Verified') ? (
                    <>
                      <div style={{ fontSize: '3rem', color: '#10b981' }}>&#10004;</div>
                      <h4 style={{ color: '#10b981', marginTop: '0.5rem' }}>Verified</h4>
                      <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                        This application has been verified and forwarded to the Treasurer.
                      </p>
                    </>
                  ) : application.status.includes('Rejected') ? (
                    <>
                      <div style={{ fontSize: '3rem', color: '#ef4444' }}>&#10006;</div>
                      <h4 style={{ color: '#ef4444', marginTop: '0.5rem' }}>Rejected</h4>
                      <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>This application has been rejected.</p>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: '3rem', color: '#f59e0b' }}>&#9203;</div>
                      <h4 style={{ color: '#f59e0b', marginTop: '0.5rem' }}>{application.status}</h4>
                      <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>This application is currently being processed.</p>
                    </>
                  )}
                </div>
              </Card>

              {/* Record Disbursement — shown when loan is Active and not yet booked */}
              {['Active', 'Overdue', 'Disbursed'].includes(application.status) && (
                <Card title="Loan Disbursement" headerColor="#17236a" style={{ marginTop: '1rem' }}>
                  {application.disbursement_recorded ? (
                    <div style={{ textAlign: 'center', padding: '0.5rem' }}>
                      <div style={{ fontSize: '2rem', color: '#10b981' }}>&#10004;</div>
                      <p style={{ color: '#10b981', fontWeight: 600, margin: '0.25rem 0' }}>Recorded in Books</p>
                      <p style={{ color: '#6b7280', fontSize: '0.8rem' }}>Disbursement has been entered in the accounting books.</p>
                    </div>
                  ) : (
                    <>
                      <p style={{ color: '#e0e7ff', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                        Funds have been released. Record this disbursement in the accounting books.
                      </p>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: '#e0e7ff', marginBottom: '0.25rem' }}>
                        Notes (optional)
                      </label>
                      <textarea
                        value={disbursementNotes}
                        onChange={e => setDisbursementNotes(e.target.value)}
                        placeholder="e.g. Disbursed via payroll on Mar 31"
                        rows={2}
                        style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '0.375rem', border: '1px solid #4c5ea6', background: '#1e2f7a', color: '#fff', fontSize: '0.8rem', resize: 'none', boxSizing: 'border-box' }}
                      />
                      {disbursementError && (
                        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '0.4rem 0.6rem', borderRadius: '0.375rem', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                          {disbursementError}
                        </div>
                      )}
                      <button
                        onClick={handleRecordDisbursement}
                        disabled={recordingDisbursement}
                        style={{
                          width: '100%', marginTop: '0.75rem', background: '#fff', color: '#17236a',
                          border: 'none', borderRadius: '0.375rem', padding: '0.6rem',
                          fontWeight: 600, cursor: recordingDisbursement ? 'not-allowed' : 'pointer',
                          opacity: recordingDisbursement ? 0.7 : 1, fontSize: '0.875rem',
                        }}
                      >
                        {recordingDisbursement ? 'Recording…' : '&#128218; Record in Books'}
                      </button>
                    </>
                  )}
                </Card>
              )}
            </>
          )}

          {/* Quick Summary */}
          <Card title="Quick Summary" style={{ marginTop: '1rem' }}>
            <InfoRow label="Loan Type" value={application.loan_type.name} />
            <InfoRow label="Amount" value={`&#8369;${parseFloat(application.amount_requested).toLocaleString()}`} />
            <InfoRow label="Term" value={`${application.term_months} months`} />
            <InfoRow label="Documents" value={`${documents.length} file(s)`} />
            <InfoRow label="Co-Makers" value={`${comakers.length}`} />
            <InfoRow label="Submitted" value={formatTimeAgo(application.application_date)} />
            {face_verification && (
              <InfoRow label="Face Match">
                <span style={{
                  background: face_verification.verification_status === 'Verified' ? '#d1fae5' : face_verification.verification_status === 'Needs Review' ? '#fef3c7' : '#fee2e2',
                  color: face_verification.verification_status === 'Verified' ? '#065f46' : face_verification.verification_status === 'Needs Review' ? '#92400e' : '#991b1b',
                  padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem',
                }}>
                  {face_verification.verification_status}
                </span>
              </InfoRow>
            )}
            {liveness_check && (
              <InfoRow label="Liveness">
                <span style={{
                  background: liveness_check.check_status === 'Verified' ? '#d1fae5' : '#fee2e2',
                  color: liveness_check.check_status === 'Verified' ? '#065f46' : '#991b1b',
                  padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem',
                }}>
                  {liveness_check.check_status}
                </span>
              </InfoRow>
            )}
          </Card>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{ background: '#fff', borderRadius: '0.75rem', width: '100%', maxWidth: '500px', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem', color: '#ef4444' }}>Reject Application</h3>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem' }}>
                Rejection Reason <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Provide a clear reason for rejection..."
                rows={3}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', resize: 'none' }}
                required
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem' }}>
                Additional Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes..."
                rows={2}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', resize: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setShowRejectModal(false)}
                style={{ flex: 1, padding: '0.75rem', border: '1px solid #d1d5db', background: '#fff', borderRadius: '0.375rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={processing}
                style={{
                  flex: 1, padding: '0.75rem', background: '#ef4444', color: '#fff',
                  border: 'none', borderRadius: '0.375rem', fontWeight: 600,
                  cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.7 : 1,
                }}
              >
                {processing ? 'Processing...' : 'Reject Application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, badge, headerColor, children, style }) {
  return (
    <div style={{ background: '#fff', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', ...style }}>
      <div style={{
        padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: headerColor || undefined, color: headerColor ? '#fff' : undefined,
      }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
        {badge && (
          <span style={{ background: headerColor ? 'rgba(255,255,255,0.2)' : '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{ padding: '1rem 1.5rem' }}>{children}</div>
    </div>
  );
}

function SectionLabel({ children, style }) {
  return (
    <h4 style={{ color: '#6b7280', marginBottom: '0.75rem', marginTop: 0, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', ...style }}>
      {children}
    </h4>
  );
}

function StatusBadge({ label, color }) {
  const colorMap = {
    green: { background: '#d1fae5', color: '#065f46' },
    yellow: { background: '#fef3c7', color: '#92400e' },
    red: { background: '#fee2e2', color: '#991b1b' },
  };
  const s = colorMap[color] || colorMap.red;
  return (
    <span style={{ ...s, padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600, display: 'inline-block', marginBottom: '0.75rem' }}>
      {label}
    </span>
  );
}

function InfoRow({ label, value, highlight, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{label}</span>
      {children || (
        <span
          style={{ fontWeight: highlight ? 700 : 500, color: highlight ? '#17236a' : '#1f2937', fontSize: highlight ? '1.125rem' : '0.875rem', textAlign: 'right', maxWidth: '60%' }}
          dangerouslySetInnerHTML={{ __html: value }}
        />
      )}
    </div>
  );
}

function capitalize(str) {
  if (!str) return '—';
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateString) {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const thStyle = { padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' };
const tdStyle = { padding: '0.75rem 1rem', fontSize: '0.875rem' };
