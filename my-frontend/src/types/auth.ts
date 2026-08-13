export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
}

export interface AuthSession {
  id: string;
  userId: string;
  deviceName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  current: boolean;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

export interface AuthPayload {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: User;
  session: AuthSession;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  displayName?: string;
}
