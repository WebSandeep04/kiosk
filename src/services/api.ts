import axios from 'axios';
import { storageService, CachedEmployee } from './storage';

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  status?: number;
}

// 1. Define hardcoded URLs and toggle for Local Dev vs Live Production
const USE_DEV_URL = true; // Set to true to test against local machine, false for production
const DEV_URL = 'http://192.168.1.6:8000/api';
const PROD_URL = 'https://app.workorio.com/api';

export const GATEWAY_URL = (USE_DEV_URL ? DEV_URL : PROD_URL).replace(/\/$/, '');

// 2. Create a dynamic Axios client instance pre-bound to the configured URL
export const apiClient = axios.create({
  baseURL: GATEWAY_URL,
  timeout: 15000,
});

// 3. Request Interceptor: Dynamically resolve and apply the Sanctum token from storage
apiClient.interceptors.request.use(async (config) => {
  const settings = await storageService.getSettings();

  config.baseURL = GATEWAY_URL;

  if (settings.authToken) {
    config.headers.Authorization = `Bearer ${settings.authToken}`;
  }

  if (settings.tenantId) {
    config.headers['X-Tenant-ID'] = String(settings.tenantId);
  }

  config.headers['Content-Type'] = 'application/json';
  config.headers.Accept = 'application/json';

  return config;
}, (error) => {
  return Promise.reject(error);
});

export const apiService = {
  /**
   * Helper to perform GET requests
   */
  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    try {
      const response = await apiClient.get<any>(endpoint);
      const data = response.data;

      // Automatically unwrap standard Laravel { data: [...] } envelope structure
      const payload = data && typeof data === 'object' && 'data' in data ? data.data : data;
      return { success: true, data: payload, status: response.status };
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Request failed';
      return { success: false, message: errMsg, status: err.response?.status };
    }
  },

  /**
   * Helper to perform POST requests
   */
  async post<T>(endpoint: string, body: any): Promise<ApiResponse<T>> {
    try {
      const response = await apiClient.post<any>(endpoint, body);
      const data = response.data;

      // Automatically unwrap standard Laravel { data: [...] } envelope structure
      const payload = data && typeof data === 'object' && 'data' in data ? data.data : data;
      return { success: true, data: payload, status: response.status };
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Request failed';
      return { success: false, message: errMsg, status: err.response?.status };
    }
  },

};
