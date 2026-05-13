import React, { useState } from 'react';
import { Constr, Data } from 'lucid-cardano';
import type { Lucid } from 'lucid-cardano';
import { CARDANO_CONFIG } from '../config/cardano';
import { ShieldCheck, UserPlus, UserMinus, Activity, ArrowRight } from 'lucide-react';

interface AdminPortalProps {
  lucid: Lucid | null;
  address: string;
  setStatus: (status: { type: 'success' | 'error' | 'info'; msg: string } | null) => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ lucid, address, setStatus }) => {
  const [issuerPkh, setIssuerPkh] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegistryAction = async (action: 'Add' | 'Remove') => {
    if (!lucid || !address) {
      setStatus({ type: 'error', msg: 'Connect your admin wallet first.' });
      return;
    }

    if (issuerPkh.length !== 56) {
      setStatus({ type: 'error', msg: 'Invalid PKH length. Expected 56 hex characters.' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'info', msg: `Building ${action}Issuer transaction...` });

    try {
      // 1. Get current Registry UTXO
      const [registryUtxo] = await lucid.utxosAt(CARDANO_CONFIG.REGISTRY_ADDRESS);
      if (!registryUtxo) throw new Error('Registry UTXO not found on-chain.');

      // 2. Decode the inline datum
      // lucid-cardano stores inline datums in utxo.datum as CBOR hex
      const rawCbor = registryUtxo.datum ?? (registryUtxo as any).inlineDatum;
      if (!rawCbor) throw new Error('Registry UTXO is missing an inline datum.');

      const parsed = Data.from(rawCbor);
      // RegistryDatum is Constr(0, [admin: ByteArray, issuers: List<ByteArray>, version: Int])
      if (!(parsed instanceof Constr)) {
        throw new Error('Unexpected datum format from Registry UTXO.');
      }

      const currentAdmin = parsed.fields[0] as string;
      const currentIssuers = (parsed.fields[1] as string[]).map(s => s.toLowerCase());
      const currentVersion = parsed.fields[2] as bigint;
      const normalizedPkh = issuerPkh.toLowerCase();

      let newIssuers = [...currentIssuers];

      if (action === 'Add') {
        if (newIssuers.includes(normalizedPkh)) throw new Error('Issuer already authorized.');
        newIssuers.push(normalizedPkh);
      } else {
        if (!newIssuers.includes(normalizedPkh)) throw new Error('Issuer not found in registry.');
        newIssuers = newIssuers.filter(p => p !== normalizedPkh);
      }

      const nextDatum = Data.to(new Constr(0, [
        currentAdmin,
        newIssuers,
        currentVersion + 1n,
      ]));

      const redeemer = action === 'Add'
        ? Data.to(new Constr(0, [normalizedPkh]))  // AddIssuer { pkh }
        : Data.to(new Constr(1, [normalizedPkh])); // RemoveIssuer { pkh }
      console.log("Script: ", CARDANO_CONFIG.REGISTRY_SCRIPT)
      const tx = await lucid
        .newTx()
        .collectFrom([registryUtxo], redeemer)
        .attachSpendingValidator(CARDANO_CONFIG.REGISTRY_SCRIPT)
        .payToContract(
          CARDANO_CONFIG.REGISTRY_ADDRESS,
          { inline: nextDatum },
          { lovelace: 3_000_000n }
        )
        .complete();

      const signedTx = await tx.sign().complete();
      const txHash = await signedTx.submit();

      setStatus({ type: 'success', msg: `Registry updated! Tx: ${txHash.slice(0, 15)}...` });
      setIssuerPkh('');
    } catch (e: any) {
      console.error(e);
      setStatus({ type: 'error', msg: e.message || 'Transaction failed.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-portal-container animate-fade-in">
      <div className="portal-header">
        <div className="icon-badge">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Issuer Registry</h2>
          <p className="text-gray-400 text-sm">Manage authorized gemstone certificate issuers</p>
        </div>
      </div>

      <div className="stats-grid mb-8">
        <div className="stat-card">
          <Activity className="w-4 h-4 text-emerald-400 mb-2" />
          <span className="text-xs text-gray-500 uppercase tracking-wider">Status</span>
          <span className="text-lg font-semibold text-white">Active</span>
        </div>
        <div className="stat-card">
          <ShieldCheck className="w-4 h-4 text-blue-400 mb-2" />
          <span className="text-xs text-gray-500 uppercase tracking-wider">Network</span>
          <span className="text-lg font-semibold text-white">Preprod</span>
        </div>
      </div>

      <div className="action-card bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
        <label className="block text-sm font-medium text-gray-300 mb-3">
          Issuer Verification Key Hash (PKH)
        </label>
        <div className="relative mb-6">
          <input
            type="text"
            value={issuerPkh}
            onChange={(e) => setIssuerPkh(e.target.value)}
            placeholder="e.g. 5ae39bf8f081a3a4bbd823c1beb0ce09e3d47f4b56e9..."
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all font-mono text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleRegistryAction('Add')}
            disabled={loading || !issuerPkh}
            className="group flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg shadow-emerald-900/20"
          >
            <UserPlus className="w-5 h-5" />
            <span>Authorize</span>
            <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
          </button>

          <button
            onClick={() => handleRegistryAction('Remove')}
            disabled={loading || !issuerPkh}
            className="flex items-center justify-center gap-2 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/40 disabled:opacity-50 text-gray-300 hover:text-red-400 font-semibold py-3 px-6 rounded-xl transition-all"
          >
            <UserMinus className="w-5 h-5" />
            <span>Revoke</span>
          </button>
        </div>
      </div>

      <div className="mt-6 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 flex gap-3">
        <div className="text-blue-400 shrink-0">
          <Activity className="w-5 h-5" />
        </div>
        <p className="text-xs text-blue-300/80 leading-relaxed">
          Authorization changes are recorded on the Cardano blockchain. Ensure the issuer PKH is verified before authorizing, as they will have immediate permission to mint certificate NFTs.
        </p>
      </div>
    </div>
  );
};
