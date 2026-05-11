import React from 'react';
import { StatusBox } from './StatusBox';
import { NetworkInfo } from './NetworkInfo';
import { WalletStatus } from './WalletStatus';
import type { StatusMessage } from '../types/index';

interface SidebarProps {
  status: StatusMessage | null;
  address: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ status, address }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <StatusBox status={status} />
      <NetworkInfo />
      <WalletStatus address={address} />
    </div>
  );
};
