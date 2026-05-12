import React from 'react';
import { Wallet, ChevronRight } from 'lucide-react';

interface WalletStatusProps {
  address: string;
}

export const WalletStatus: React.FC<WalletStatusProps> = ({ address }) => {
  return (
    <div className="card">
      <div className="card-header" style={{ marginBottom: '0.5rem', paddingBottom: '1rem' }}>
        <div className="card-icon"><Wallet size={18} /></div>
        <div className="card-title">Wallet</div>
      </div>
      <div className="info-row">
        <ChevronRight size={14} className="info-row-icon" />
        <span className="info-row-label">Status</span>
        {address
          ? <span className="tag" style={{ color: '#166534', borderColor: '#bbf7d0', background: '#f0fdf4' }}>Connected</span>
          : <span className="tag">Disconnected</span>
        }
      </div>
      {address && (
        <div className="info-row">
          <ChevronRight size={14} className="info-row-icon" />
          <span className="info-row-label">Address</span>
          <span className="info-row-value" style={{ fontFamily: 'monospace', fontSize: '0.68rem' }}>
            {address.slice(0, 10)}…{address.slice(-6)}
          </span>
        </div>
      )}
      <div className="info-row">
        <ChevronRight size={14} className="info-row-icon" />
        <span className="info-row-label">CIP-30</span>
        <span className="info-row-value">Supported</span>
      </div>
    </div>
  );
};
