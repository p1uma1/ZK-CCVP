import React from 'react';
import { Network, ChevronRight } from 'lucide-react';

export const NetworkInfo: React.FC = () => {
  return (
    <div className="card">
      <div className="card-header" style={{ marginBottom: '0.5rem', paddingBottom: '1rem' }}>
        <div className="card-icon"><Network size={18} /></div>
        <div className="card-title">Network</div>
      </div>

      <div className="info-row">
        <ChevronRight size={14} className="info-row-icon" />
        <span className="info-row-label">Chain</span>
        <span className="tag">Cardano</span>
      </div>
      <div className="info-row">
        <ChevronRight size={14} className="info-row-icon" />
        <span className="info-row-label">Environment</span>
        <span className="tag">Preprod</span>
      </div>
      <div className="info-row">
        <ChevronRight size={14} className="info-row-icon" />
        <span className="info-row-label">Smart Contract</span>
        <span className="info-row-value">PlutusV3</span>
      </div>
      <div className="info-row">
        <ChevronRight size={14} className="info-row-icon" />
        <span className="info-row-label">Min ADA Lock</span>
        <span className="info-row-value">2.0 ₳</span>
      </div>
    </div>
  );
};
