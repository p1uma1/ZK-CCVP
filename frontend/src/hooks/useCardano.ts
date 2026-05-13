import { useState, useEffect, useCallback } from 'react';
import type { StatusMessage } from '../types/index';
import { utilsService } from '../services/api';

export function useCardano() {
  const [address, setAddress] = useState<string>('');
  const [availableWallets, setAvailableWallets] = useState<string[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string>('nami');
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [walletApi, setWalletApi] = useState<any>(null);

  useEffect(() => {
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

  const connectWallet = async () => {
    try {
      const cw = (window as any).cardano;
      if (!cw?.[selectedWallet]) {
        setStatus({ type: 'error', msg: `${selectedWallet.toUpperCase()} wallet extension not detected.` });
        return;
      }

      const api = await cw[selectedWallet].enable();
      setWalletApi(api);

      // Get address (hex) and convert to bech32 via backend
      const hexAddrs = await api.getUsedAddresses();
      if (hexAddrs.length > 0) {
        const res = await utilsService.convertHexAddress(hexAddrs[0]);
        if (res.success && res.data?.address) {
          setAddress(res.data.address);
        } else {
          setAddress(hexAddrs[0]); // fallback to hex if conversion fails
        }
      }

      setStatus({ type: 'info', msg: `${selectedWallet.toUpperCase()} wallet connected.` });
    } catch (e) {
      console.error('Wallet connect error', e);
      setStatus({ type: 'error', msg: 'Wallet connection was rejected or failed.' });
    }
  };

  const disconnectWallet = () => {
    setAddress('');
    setWalletApi(null);
    setStatus(null);
  };

  /**
   * Helper to sign a transaction CBOR hex string using the connected wallet.
   */
  const signTx = async (unsignedTxHex: string): Promise<{ unsignedTxHex: string; signedWitnessSet: string }> => {
    if (!walletApi) throw new Error("Wallet not connected");
    const signedWitnessSet = await walletApi.signTx(unsignedTxHex, true);
    return { unsignedTxHex, signedWitnessSet };
  };

  return {
    address,
    availableWallets,
    selectedWallet,
    setSelectedWallet,
    status,
    setStatus,
    connectWallet,
    disconnectWallet,
    signTx,
    walletApi
  };
}
