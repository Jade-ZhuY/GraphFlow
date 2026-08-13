import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { getAuthAccessToken } from '@/services/authSession';
import type { ApiResponse } from '@/types/auth';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

type RefreshHandler = () => Promise<string | null>;
type AuthExpiredHandler = () => void;

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _authRetry?: boolean;
}

export class ApiError extends Error {
  code: number;
  status?: number;
  data: unknown;

  constructor({
    code,
    message,
    status,
    data,
  }: {
    code: number;
    message: string;
    status?: number;
    data?: unknown;
  }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

let refreshHandler: RefreshHandler | null = null;
let authExpiredHandler: AuthExpiredHandler | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function registerAuthRefreshHandler(handler: RefreshHandler): void {
  refreshHandler = handler;
}

export function registerAuthExpiredHandler(handler: AuthExpiredHandler): void {
  authExpiredHandler = handler;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = getAuthAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse<unknown>;
    if (!body || typeof body.code !== 'number') {
      return response.data;
    }
    if (body.code !== 0) {
      throw new ApiError({
        code: body.code,
        message: body.message || '请求失败',
        status: response.status,
        data: body.data,
      });
    }
    return body.data;
  },
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const response = error.response;
    const body = response?.data;
    const config = error.config as RetryableRequestConfig | undefined;
    const code = body?.code;

    if (code === 40103 && config && !config._authRetry && refreshHandler) {
      config._authRetry = true;
      refreshPromise ??= refreshHandler().finally(() => {
        refreshPromise = null;
      });

      const newToken = await refreshPromise;
      if (newToken) {
        config.headers.Authorization = `Bearer ${newToken}`;
        return apiClient.request(config);
      }
    }

    if (code === 40102) {
      authExpiredHandler?.();
    }

    throw new ApiError({
      code: code ?? response?.status ?? 50001,
      message: body?.message || error.message || '网络请求失败',
      status: response?.status,
      data: body?.data,
    });
  }
);

export function apiRequest<T>(config: AxiosRequestConfig): Promise<T> {
  return apiClient.request<ApiResponse<T>, T>(config);
}

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '操作失败，请稍后重试';
}
