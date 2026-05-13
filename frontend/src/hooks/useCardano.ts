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
  const signTx = async (unsignedTxHex: string): Promise<string> => {
    if (!walletApi) throw new Error('Wallet not connected');
    
    // CIP-30 signTx returns a witness set
    // However, if we want the FULL signed transaction, we might need a way to combine them.
    // BUT, the backend can also accept the witness set or the full transaction.
    // To keep it simple and consistent with Lucid, we can use a very light-weight 
    // CBOR library if needed, OR just let the backend handle the witness merge.
    // ACTUALLY, many wallets support returning the full signed tx if you use specific methods
    // OR we can use the backend to merge.
    
    // For this implementation, we'll assume the backend wants the FULL signed transaction.
    // Since we removed Lucid, merging the witness set manually is hard.
    // BUT, some wallets (like Nami) have a legacy mode or we can use the witness set directly in the backend.
    
    // Actually, let's assume the wallet returns the signed witness set and we send THAT to the backend.
    // Wait, the backend's `lucid.fromTx(signedTx).submit()` expects a full signed transaction.
    
    // Let's reconsider: Is there a light-weight way to sign in the frontend?
    // If I really want to remove Lucid, I might need to handle the witness set on the backend.
    
    // Let's update the backend `submitSignedTx` to accept { txBody, witnesses } if needed.
    // BUT, if we want to stay compatible with what we had:
    const signedWitnessSet = await walletApi.signTx(unsignedTxHex, true);
    
    // We'll send BOTH to the backend to merge.
    return JSON.stringify({ unsignedTxHex, signedWitnessSet });
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
