import { useState, useEffect, useCallback } from 'react';
import { Lucid, Blockfrost } from 'lucid-cardano';
import type { StatusMessage } from '../types/index';

export function useCardano() {
  const [lucid, setLucid] = useState<Lucid | null>(null);
  const [address, setAddress] = useState<string>('');
  const [availableWallets, setAvailableWallets] = useState<string[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string>('nami');
  const [status, setStatus] = useState<StatusMessage | null>(null);

  useEffect(() => {
    initLucid();
    checkWallets();
  }, []);

  const checkWallets = useCallback(() => {
    const w: string[] = [];
    if ((window as any).cardano) {
      const cw = (window as any).cardano;
      if (cw.nami) w.push('nami');
      if (cw.eternl) w.push('eternl');
      if (cw.lace) w.push('lace');
      if (cw.flint) w.push('flint');
      if (cw.vespr) w.push('vespr');
    }
    setAvailableWallets(w);
    if (w.length > 0) setSelectedWallet(w[0]);
  }, []);

  const initLucid = async () => {
    if (lucid) return;
    try {
      const key = (import.meta as any).env?.VITE_BLOCKFROST_PROJECT_ID || 'preprodYKOGh6iToLhXzKjydl3LmUDaszQWKqfu';
      console.log('[useCardano] Initializing Lucid...');
      const l = await Lucid.new(
        new Blockfrost(
          "https://cardano-preprod.blockfrost.io/api/v0",
          key
        ),
        "Preprod"
      );
      setLucid(l);
    } catch (e) {
      console.error('Lucid init error', e);
    }
  };

  const connectWallet = async () => {
    if (!lucid) return;
    try {
      const cw = (window as any).cardano;
      if (!cw?.[selectedWallet]) {
        setStatus({ type: 'error', msg: `${selectedWallet.toUpperCase()} wallet extension not detected.` });
        return;
      }
      const api = await cw[selectedWallet].enable();
      lucid.selectWallet(api);
      const addr = await lucid.wallet.address();
      setAddress(addr);
      setStatus({ type: 'info', msg: `${selectedWallet.toUpperCase()} wallet connected.` });
    } catch (e) {
      console.error('Wallet connect error', e);
      setStatus({ type: 'error', msg: 'Wallet connection was rejected or failed.' });
    }
  };

  const disconnectWallet = () => {
    setAddress('');
    setStatus(null);
  };

  return {
    lucid,
    address,
    availableWallets,
    selectedWallet,
    setSelectedWallet,
    status,
    setStatus,
    connectWallet,
    disconnectWallet
  };
}
