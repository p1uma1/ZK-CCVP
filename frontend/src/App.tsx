import { useState, useEffect } from 'react';
import { useCardano } from './hooks/useCardano';
import { certificateService, utilsService } from './services/api';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { CertificateForm } from './components/CertificateForm';
import { AdminPortal } from './components/AdminPortal';
import type { CertificateFormData } from './types/index';
import './index.css';

function App() {
  const {
    address,
    availableWallets,
    selectedWallet,
    setSelectedWallet,
    status,
    setStatus,
    connectWallet,
    disconnectWallet,
    signTx
  } = useCardano();

  const [activeTab, setActiveTab] = useState<'issuer' | 'admin'>('issuer');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CertificateFormData>({
    gemId: 'GEM-LK-SAP-2024-001',
    issuerId: 'GIC-LAB-COLOMBO',
    issuerPkh: '5c271a827c961bfdc59dec8a2f0f3a6e8f6218a694e44917d6d6a76e',
    reportId: 'GIC-8832104',
    reportType: 1,
    ipfsLink: 'ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
  });

  // Autofill issuer PKH when address changes
  useEffect(() => {
    if (address) {
      utilsService.getAddressPkh(address).then(res => {
        if (res.success && res.data?.pkh) {
          setFormData(prev => ({ ...prev, issuerPkh: res.data.pkh }));
        }
      });
    }
  }, [address]);

  const handleRegisterAndSign = async () => {
    if (!address) {
      setStatus({ type: 'error', msg: 'Connect your wallet before registering.' });
      return;
    }


    setLoading(true);
    setStatus(null);

    try {
      setStatus({ type: 'info', msg: '(1/3) Requesting transaction from backend…' });

      // 1. Get Unsigned Transaction from Backend
      const createRes = await certificateService.createCertificate(formData, address);

      if (!createRes.success || !createRes.data?.unsignedTx) {
        throw new Error(createRes.error || 'Failed to generate unsigned transaction');
      }

      // 2. Sign Transaction Locally
      setStatus({ type: 'info', msg: `(2/3) Awaiting signature for ${formData.gemId}…` });

      const { unsignedTx } = createRes.data;
      const signedData = await signTx(unsignedTx);

      // 3. Submit Signed Transaction via Backend
      setStatus({ type: 'info', msg: '(3/3) Submitting signed transaction…' });

      const submitRes = await certificateService.submitTransaction(signedData);

      if (!submitRes.success || !submitRes.data?.txHash) {
        throw new Error(submitRes.error || 'Failed to submit transaction');
      }

      const txHash = submitRes.data.txHash;

      setStatus({
        type: 'success',
        msg: `✓ Certificate anchored! Gem: ${formData.gemId} | Tx: ${txHash.slice(0, 20)}…`,
      });
      console.log('[ZK-CCVP] Transaction Hash:', txHash);

    } catch (e: any) {
      console.error('[ZK-CCVP] Error:', e);
      const msg = e?.message?.includes('user declined') || e?.message?.includes('User declined')
        ? 'Wallet signing was cancelled.'
        : e.message || 'Transaction failed.';
      setStatus({ type: 'error', msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <Navbar
        address={address}
        selectedWallet={selectedWallet}
        availableWallets={availableWallets}
        onSelectWallet={setSelectedWallet}
        onConnect={connectWallet}
        onDisconnect={disconnectWallet}
      />

      <div className="app-content">
        <div className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'issuer' ? 'active' : ''}`}
            onClick={() => setActiveTab('issuer')}
          >
            Issuer Portal
          </button>
          <button
            className={`nav-tab ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            Admin Control
          </button>
        </div>

        <div className="page-grid">
          <div className="main-area">
            {activeTab === 'issuer' ? (
              <CertificateForm
                formData={formData}
                setFormData={setFormData}
                loading={loading}
                onRegister={handleRegisterAndSign}
              />
            ) : (
              <AdminPortal
                address={address}
                setStatus={setStatus}
                signTx={signTx}
              />
            )}
          </div>
          <Sidebar status={status} address={address} />
        </div>
      </div>
    </div>
  );
}

export default App;
