import React from 'react';
import { Gem, Hash, FileText, Fingerprint, Link as LinkIcon, Send, Loader2 } from 'lucide-react';
import type { CertificateFormData } from '../types/index';

interface CertificateFormProps {
  formData: CertificateFormData;
  setFormData: React.Dispatch<React.SetStateAction<CertificateFormData>>;
  loading: boolean;
  onRegister: () => void;
}

export const CertificateForm: React.FC<CertificateFormProps> = ({
  formData,
  setFormData,
  loading,
  onRegister,
}) => {
  const field = (id: string, label: string, icon: React.ReactNode, value: string, onChange: (v: string) => void, extraClass = '') => {
    return (
      <div className={`form-field ${extraClass}`}>
        <label className="section-label" htmlFor={id}>{label}</label>
        <div className="input-wrap">
          <span className="input-icon">{icon}</span>
          <input id={id} className="input has-icon" value={value} onChange={e => onChange(e.target.value)} />
        </div>
      </div>
    );
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-icon"><Gem size={18} /></div>
        <div>
          <div className="card-title">Certificate Registration</div>
          <div className="card-sub">Anchor a gemstone certificate onto the Cardano ledger</div>
        </div>
      </div>

      <div className="form-grid">
        {field('gemId', 'Gemstone ID', <Hash size={15} />, formData.gemId,
          v => setFormData(f => ({ ...f, gemId: v })))}
        {field('reportId', 'Report ID', <FileText size={15} />, formData.reportId,
          v => setFormData(f => ({ ...f, reportId: v })))}
        {field('issuerPkh', 'Issuer Public Key Hash', <Fingerprint size={15} />, formData.issuerPkh,
          v => setFormData(f => ({ ...f, issuerPkh: v })), 'col-2')}
        {field('ipfsLink', 'IPFS Document CID', <LinkIcon size={15} />, formData.ipfsLink,
          v => setFormData(f => ({ ...f, ipfsLink: v })), 'col-2')}
      </div>

      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--gs-100)' }}>
        <button
          className="btn-primary btn-primary-lg"
          disabled={loading}
          onClick={onRegister}
        >
          {loading
            ? <><Loader2 size={16} className="spin" /> Processing Transaction…</>
            : <><Send size={16} /> Execute Registration &amp; Anchor Proof</>
          }
        </button>
      </div>
    </div>
  );
};
