import { useState, useEffect } from 'react';
import { useCardano } from './hooks/useCardano';
import { Data, fromText, Constr, paymentCredentialOf, fromHex } from 'lucid-cardano';
import { CARDANO_CONFIG, getCertificatePolicyScript } from './config/cardano';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { CertificateForm } from './components/CertificateForm';
import { AdminPortal } from './components/AdminPortal';
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
      try {
        const pkh = paymentCredentialOf(address).hash;
        setFormData(prev => ({ ...prev, issuerPkh: pkh }));
      } catch (e) {
        console.error("Error extracting PKH from address", e);
      }
    }
  }, [address]);

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
      setStatus({ type: 'info', msg: '(1/3) Preparing transaction data…' });

      // 1. Get current Registry UTXO for reference input
      const [registryUtxo] = await lucid.utxosAt(CARDANO_CONFIG.REGISTRY_ADDRESS);
      if (!registryUtxo) throw new Error('Registry UTXO not found on-chain.');

      // 2. Prepare Datum
      const datum = Data.to(new Constr(0, [
        fromText(formData.issuerId),
        fromText(formData.reportId),
        BigInt(formData.reportType),
        fromText(formData.gemId),
        fromText(formData.issuerPkh),
        BigInt(Date.now()),
        1n,
        fromText(formData.ipfsLink.replace('ipfs://', '')),
        formData.issuerPkh,
      ]));
      const assetName = fromText(formData.gemId);
      const unit = CARDANO_CONFIG.CERTIFICATE_POLICY_ID + assetName;

      // 3. Build Transaction
      setStatus({ type: 'info', msg: `(2/3) Awaiting signature for ${formData.gemId}…` });

      const tx = await (lucid as any)
        .newTx()
        .readFrom([registryUtxo]) // Reference input
        .mintAssets({ [unit]: 1n }, Data.to(formData.issuerPkh)) // Mint 1 token with issuer PKH as redeemer
        .attachMintingPolicy(getCertificatePolicyScript())
        .payToContract(
          CARDANO_CONFIG.CERTIFICATE_ADDRESS,
          { inline: datum },
          { [unit]: 1n, lovelace: 2_000_000n } // Store the NFT at the certificate storage address
        )
        .complete();

      const signedTx = await tx.sign().complete();
      const txHash = await signedTx.submit();

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
                lucid={lucid}
                address={address}
                setStatus={setStatus}
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
