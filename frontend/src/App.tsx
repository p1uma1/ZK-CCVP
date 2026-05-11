
import React, { useState, useEffect } from 'react';
import { Lucid, Blockfrost } from 'lucid-cardano';
import axios from 'axios';
import { Shield, Gem, Fingerprint, Wallet, Send, CheckCircle2, Loader2, Link as LinkIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const BACKEND_URL = 'http://localhost:3000';

function App() {
  const [lucid, setLucid] = useState<Lucid | null>(null);
  const [address, setAddress] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', msg: string } | null>(null);
  
  // Form State
  const [formData, setFormData] = useState({
    gemId: 'GEM-LK-SAP-2024-001',
    issuerId: 'GIC-LAB-COLOMBO',
    issuerPkh: '5c271a827c961bfdc59dec8a2f0f3a6e8f6218a694e44917d6d6a76e',
    reportId: 'GIC-8832104',
    reportType: 1,
    ipfsLink: 'ipfs://QmXoypizjW3...'
  });

  useEffect(() => {
    initLucid();
  }, []);

  async function initLucid() {
    try {
      const lucidInst = await Lucid.new(
        new Blockfrost("https://cardano-preprod.blockfrost.io/api/v0", "preprod_YOUR_PROJECT_ID"), // You should replace this
        "Preprod"
      );
      setLucid(lucidInst);
    } catch (err) {
      console.error("Lucid init error", err);
    }
  }

  async function connectWallet() {
    if (!lucid) return;
    try {
      const api = await window.cardano.lace.enable(); // Defaulting to Lace
      lucid.selectWallet(api);
      const addr = await lucid.wallet.address();
      setAddress(addr);
      setStatus({ type: 'info', msg: 'Wallet connected successfully' });
    } catch (err) {
      setStatus({ type: 'error', msg: 'Failed to connect wallet' });
    }
  }

  async function handleRegisterAndSign() {
    if (!address) {
      setStatus({ type: 'error', msg: 'Please connect your wallet first' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'info', msg: 'Requesting unsigned transaction from backend...' });

    try {
      // 1. Get unsigned transaction from backend
      const response = await axios.post(`${BACKEND_URL}/api/certificates/create`, {
        ...formData,
        userAddress: address
      });

      const { unsignedTx } = response.data.data;
      setStatus({ type: 'info', msg: 'Signing transaction...' });

      // 2. Sign with Lucid
      const tx = lucid!.fromTx(unsignedTx);
      const signedTx = await tx.sign().complete();

      // 3. Submit
      const txHash = await signedTx.submit();
      
      setStatus({ 
        type: 'success', 
        msg: `Certificate anchored! Transaction Hash: ${txHash}` 
      });
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || 'Transaction failed';
      setStatus({ type: 'error', msg: errorMsg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center">
              <Shield className="text-primary w-8 h-8" />
            </div>
            <div>
              <h1>ZK-CCVP</h1>
              <p className="text-dim text-sm">Issuer Certification Portal</p>
            </div>
          </div>
          
          {address ? (
            <div className="glass-card !py-2 !px-4 flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-mono">{address.slice(0, 10)}...{address.slice(-6)}</span>
            </div>
          ) : (
            <button onClick={connectWallet} className="btn-primary">
              <Wallet size={18} /> Connect Wallet
            </button>
          )}
        </header>

        <main className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Form */}
          <div className="md:col-span-2 glass-card space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Gem className="text-accent" />
              <h2 className="text-xl font-bold">Register Gemstone</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Gemstone ID</label>
                <input 
                  className="input-field" 
                  value={formData.gemId}
                  onChange={e => setFormData({...formData, gemId: e.target.value})}
                />
              </div>
              <div>
                <label className="label">Report ID</label>
                <input 
                  className="input-field" 
                  value={formData.reportId}
                  onChange={e => setFormData({...formData, reportId: e.target.value})}
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Issuer Public Key Hash (Hex)</label>
                <div className="relative">
                  <Fingerprint className="absolute left-3 top-3 text-dim" size={18} />
                  <input 
                    className="input-field !pl-10" 
                    value={formData.issuerPkh}
                    onChange={e => setFormData({...formData, issuerPkh: e.target.value})}
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="label">IPFS Document CID</label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-3 text-dim" size={18} />
                  <input 
                    className="input-field !pl-10" 
                    value={formData.ipfsLink}
                    onChange={e => setFormData({...formData, ipfsLink: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <button 
              disabled={loading}
              onClick={handleRegisterAndSign}
              className="btn-primary w-full justify-center text-lg py-4 mt-4"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Send size={20} />}
              {loading ? 'Processing...' : 'Register & Sign Certificate'}
            </button>
          </div>

          {/* Sidebar / Status */}
          <div className="space-y-6">
            <div className="glass-card">
              <h3 className="font-bold mb-4">Verification Status</h3>
              <AnimatePresence mode="wait">
                {status ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`p-4 rounded-xl text-sm ${
                      status.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                      status.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                      'bg-primary/10 text-primary border border-primary/20'
                    }`}
                  >
                    <div className="flex gap-2">
                      {status.type === 'success' && <CheckCircle2 size={16} className="shrink-0" />}
                      <p>{status.msg}</p>
                    </div>
                  </motion.div>
                ) : (
                  <p className="text-dim text-sm">Waiting for action...</p>
                )}
              </AnimatePresence>
            </div>

            <div className="glass-card">
              <h3 className="font-bold mb-2">Network</h3>
              <div className="flex items-center gap-2">
                <div className="badge badge-pending">Cardano Preprod</div>
              </div>
              <p className="text-dim text-xs mt-4">
                This portal anchors cryptographic proofs of gemstone certificates onto the Cardano blockchain.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
