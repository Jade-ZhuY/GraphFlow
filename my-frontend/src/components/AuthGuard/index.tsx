import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuthStore } from '@/stores/useAuthStore';
import './index.css';

interface AuthGuardProps {
  children: ReactNode;
}

function getCurrentTarget(location: ReturnType<typeof useLocation>): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

function getSafeRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
}

const AuthLoading = () => (
  <div className="auth-guard-loading">
    <Spin size="large" />
    <span>正在恢复登录状态...</span>
  </div>
);

export function RequireAuth({ children }: AuthGuardProps) {
  const location = useLocation();
  const {
    isAuthenticated,
    isBootstrapping,
    hasBootstrapped,
    bootstrap,
  } = useAuthStore();

  useEffect(() => {
    if (!hasBootstrapped && !isBootstrapping) {
      void bootstrap();
    }
  }, [bootstrap, hasBootstrapped, isBootstrapping]);

  if (!hasBootstrapped || isBootstrapping) {
    return <AuthLoading />;
  }

  if (!isAuthenticated) {
    const redirect = encodeURIComponent(getCurrentTarget(location));
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  return children;
}

export function GuestOnly({ children }: AuthGuardProps) {
  const [searchParams] = useSearchParams();
  const {
    isAuthenticated,
    isBootstrapping,
    hasBootstrapped,
    bootstrap,
  } = useAuthStore();

  useEffect(() => {
    if (!hasBootstrapped && !isBootstrapping) {
      void bootstrap();
    }
  }, [bootstrap, hasBootstrapped, isBootstrapping]);

  if (!hasBootstrapped || isBootstrapping) {
    return <AuthLoading />;
  }

  if (isAuthenticated) {
    return (
      <Navigate
        to={getSafeRedirect(searchParams.get('redirect'))}
        replace
      />
    );
  }

  return children;
}
