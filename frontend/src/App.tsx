import { useState } from 'react';
import { useCardano } from './hooks/useCardano';
import { certificateService } from './services/api';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { CertificateForm } from './components/CertificateForm';
import type { CertificateFormData } from './types/index';
import './index.css';

function App() {
  const {
    lucid,
    address,
    availableWallets,
    selectedWallet,
    setSelectedWallet,
    status,
    setStatus,
    connectWallet,
    disconnectWallet
  } = useCardano();

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CertificateFormData>({
    gemId: 'GEM-LK-SAP-2024-001',
    issuerId: 'GIC-LAB-COLOMBO',
    issuerPkh: '5c271a827c961bfdc59dec8a2f0f3a6e8f6218a694e44917d6d6a76e',
    reportId: 'GIC-8832104',
    reportType: 1,
    ipfsLink: 'ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
  });

  const handleRegisterAndSign = async () => {
    if (!address) {
      setStatus({ type: 'error', msg: 'Connect your wallet before registering.' });
      return;
    }
    if (!lucid) {
      setStatus({ type: 'error', msg: 'Lucid is still initializing. Please wait.' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      // ── Step 1: Ask backend to build the unsigned tx ─────────────────
      setStatus({ type: 'info', msg: '(1/3) Building transaction on server…' });
      const buildRes = await certificateService.createCertificate(formData, address);

      if (!buildRes.success || !buildRes.data) {
        throw new Error(buildRes.error || 'Backend failed to build tx');
      }

      const { unsignedTx, gemId, reportId } = buildRes.data;

      // ── Step 2: Sign with Wallet (CIP-30) ─────────────────────────────
      setStatus({ type: 'info', msg: `(2/3) Awaiting signature in ${selectedWallet.toUpperCase()} wallet…` });
      
      console.log('[App] Debug - Lucid instance:', !!lucid);
      console.log('[App] Debug - Wallet connected:', !!lucid?.wallet);
      
      if (!lucid || !lucid.wallet) {
        throw new Error('Wallet connection lost. Please reconnect your wallet.');
      }

      const tx = lucid.fromTx(unsignedTx);
      const signedTx = await tx.sign().complete();
      const signedCbor = signedTx.toString();

      // ── Step 3: Send signed tx to backend for submission ─────────────
      setStatus({ type: 'info', msg: '(3/3) Submitting to Cardano network…' });
      const submitRes = await certificateService.submitTransaction(signedCbor);

      if (!submitRes.success || !submitRes.data) {
        throw new Error(submitRes.error || 'Submission failed');
      }

      const { txHash } = submitRes.data;

      setStatus({
        type: 'success',
        msg: `✓ Certificate anchored! Gem: ${gemId} | Report: ${reportId} | Tx: ${txHash.slice(0, 20)}…`,
      });
      console.log('[ZK-CCVP] Transaction Hash:', txHash);

    } catch (e: any) {
      console.error('[ZK-CCVP] Error:', e);
      // User rejected wallet prompt — don't show scary error
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
        <div className="page-grid">
          <CertificateForm
            formData={formData}
            setFormData={setFormData}
            loading={loading}
            onRegister={handleRegisterAndSign}
          />
          <Sidebar status={status} address={address} />
        </div>
      </div>
    </div>
  );
}

export default App;
