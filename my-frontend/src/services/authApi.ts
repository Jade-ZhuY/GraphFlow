import { apiRequest } from '@/services/http';
import type {
  AuthPayload,
  LoginRequest,
  RegisterRequest,
  User,
} from '@/types/auth';

export function register(payload: RegisterRequest): Promise<AuthPayload> {
  return apiRequest<AuthPayload>({
    method: 'POST',
    url: '/api/auth/register',
    data: payload,
  });
}

export function login(payload: LoginRequest): Promise<AuthPayload> {
  return apiRequest<AuthPayload>({
    method: 'POST',
    url: '/api/auth/login',
    data: payload,
  });
}

export function refresh(): Promise<AuthPayload> {
  return apiRequest<AuthPayload>({
    method: 'POST',
    url: '/api/auth/refresh',
    data: {},
  });
}

export function me(): Promise<User> {
  return apiRequest<User>({
    method: 'GET',
    url: '/api/auth/me',
  });
}

export function logout(): Promise<{ loggedOut: boolean }> {
  return apiRequest<{ loggedOut: boolean }>({
    method: 'POST',
    url: '/api/auth/logout',
    data: {},
  });
}
