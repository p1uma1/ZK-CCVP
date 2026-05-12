export interface CertificateFormData {
  gemId: string;
  issuerId: string;
  issuerPkh: string;
  reportId: string;
  reportType: number;
  ipfsLink: string;
}

export interface StatusMessage {
  type: 'success' | 'error' | 'info';
  msg: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateTxResponse {
  unsignedTx: string;
  gemId: string;
  reportId: string;
}

export interface SubmitTxResponse {
  txHash: string;
}
