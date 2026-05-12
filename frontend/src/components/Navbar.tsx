import React from 'react';
import { Shield, Wallet } from 'lucide-react';

interface NavbarProps {
  address: string;
  selectedWallet: string;
  availableWallets: string[];
  onSelectWallet: (wallet: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  address,
  selectedWallet,
  availableWallets,
  onSelectWallet,
  onConnect,
  onDisconnect,
}) => {
  return (
    <nav className="app-topbar">
      <div className="brand">
        <div className="brand-icon">
          <Shield size={18} color="white" />
        </div>
        <div>
          <div className="brand-name">ZK-CCVP</div>
          <div className="brand-sub">Gemstone Certification Portal</div>
        </div>
      </div>

      <div className="wallet-controls">
        {address ? (
          <>
            <div className="wallet-badge">
              <div className="wallet-dot" />
              <span className="wallet-addr">{address.slice(0, 12)}…{address.slice(-8)}</span>
            </div>
            <button className="btn-disconnect" onClick={onDisconnect}>
              Disconnect
            </button>
          </>
        ) : (
          <>
            <select
              className="wallet-select"
              value={selectedWallet}
              onChange={e => onSelectWallet(e.target.value)}
            >
              {availableWallets.length > 0
                ? availableWallets.map(w => <option key={w} value={w}>{w.toUpperCase()}</option>)
                : <option value="nami">NAMI</option>
              }
            </select>
            <button className="btn-primary" onClick={onConnect}>
              <Wallet size={14} /> Connect Wallet
            </button>
          </>
        )}
      </div>
    </nav>
  );
};
