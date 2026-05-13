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

  async submitTransaction(payload: { unsignedTxHex: string; signedWitnessSet: string }): Promise<ApiResponse<SubmitTxResponse>> {
    try {
      const response = await axios.post(`${BACKEND_URL}/api/certificates/submit`, payload);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to submit certificate transaction',
      };
    }
  }
};

export const registryService = {
  async createUpdateTx(action: 'Add' | 'Remove', issuerPkh: string, userAddress: string): Promise<ApiResponse<CreateTxResponse>> {
    try {
      const response = await axios.post(`${BACKEND_URL}/api/registry/create`, {
        action,
        issuerPkh,
        userAddress,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to create registry transaction',
      };
    }
  },

  async submitTransaction(payload: { unsignedTxHex: string; signedWitnessSet: string }): Promise<ApiResponse<SubmitTxResponse>> {
    try {
      const response = await axios.post(`${BACKEND_URL}/api/registry/submit`, payload);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to submit registry transaction',
      };
    }
  }
};

export const utilsService = {
  async getAddressPkh(address: string): Promise<ApiResponse<{ pkh: string }>> {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/utils/pkh`, {
        params: { address },
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to fetch PKH from address',
      };
    }
  },

  async convertHexAddress(hex: string): Promise<ApiResponse<{ address: string }>> {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/utils/address`, {
        params: { hex },
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to convert hex address',
      };
    }
  }
};
