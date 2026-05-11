import axios from 'axios';
import type { CertificateFormData, ApiResponse, CreateTxResponse, SubmitTxResponse } from '../types/index';

const BACKEND_URL = 'http://localhost:3000';

export const certificateService = {
  async createCertificate(formData: CertificateFormData, userAddress: string): Promise<ApiResponse<CreateTxResponse>> {
    try {
      const response = await axios.post(`${BACKEND_URL}/api/certificates/create`, {
        ...formData,
        userAddress,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to create certificate transaction',
      };
    }
  },

  async submitTransaction(signedTx: string): Promise<ApiResponse<SubmitTxResponse>> {
    try {
      const response = await axios.post(`${BACKEND_URL}/api/certificates/submit`, {
        signedTx,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to submit transaction',
      };
    }
  }
};
