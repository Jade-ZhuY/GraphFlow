import { create } from 'zustand';
import * as authApi from '@/services/authApi';
import {
  clearAuthAccessToken,
  setAuthAccessToken,
} from '@/services/authSession';
import {
  registerAuthExpiredHandler,
  registerAuthRefreshHandler,
} from '@/services/http';
import { useAssistantStore } from '@/stores/useAssistantStore';
import { useProjectStore } from '@/stores/useProjectStore';
import type {
  AuthPayload,
  AuthSession,
  LoginRequest,
  RegisterRequest,
  User,
} from '@/types/auth';

interface AuthState {
  user: User | null;
  session: AuthSession | null;
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  hasBootstrapped: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  refreshSession: () => Promise<boolean>;
  fetchMe: () => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  clearAuth: () => void;
}

async function switchDomainStorage(userId: string | null): Promise<void> {
  const projectStore = useProjectStore.getState();
  projectStore.clearProjects();

  const assistantStore = useAssistantStore.getState();
  assistantStore.clearConversations();

  if (!userId) {
    return;
  }

  try {
    await assistantStore.fetchConversations();
  } catch {
    // 会话页自己处理加载错误
  }
  try {
    await projectStore.fetchProjects();
  } catch {
    // Project pages retry loading and show their own request errors.
  }
}

function applyAccessToken(payload: AuthPayload): void {
  setAuthAccessToken(payload.accessToken);
}

export const useAuthStore = create<AuthState>()((set, get) => {
  const applyAuthPayload = async (payload: AuthPayload) => {
    applyAccessToken(payload);
    set({
      user: payload.user,
      session: payload.session,
      accessToken: payload.accessToken,
      accessTokenExpiresAt: payload.accessTokenExpiresAt,
      isAuthenticated: true,
    });
    await switchDomainStorage(payload.user.id);
  };

  const clearAuthState = () => {
    clearAuthAccessToken();
    void switchDomainStorage(null);
    set({
      user: null,
      session: null,
      accessToken: null,
      accessTokenExpiresAt: null,
      isAuthenticated: false,
    });
  };

  return {
    user: null,
    session: null,
    accessToken: null,
    accessTokenExpiresAt: null,
    isAuthenticated: false,
    isBootstrapping: false,
    hasBootstrapped: false,

    login: async (payload) => {
      const authPayload = await authApi.login(payload);
      await applyAuthPayload(authPayload);
    },

    register: async (payload) => {
      const authPayload = await authApi.register(payload);
      await applyAuthPayload(authPayload);
    },

    refreshSession: async () => {
      try {
        const authPayload = await authApi.refresh();
        await applyAuthPayload(authPayload);
        return true;
      } catch {
        clearAuthState();
        return false;
      }
    },

    fetchMe: async () => {
      const user = await authApi.me();
      set({ user, isAuthenticated: true });
    },

    logout: async () => {
      try {
        if (get().accessToken) {
          await authApi.logout();
        }
      } finally {
        clearAuthState();
      }
    },

    bootstrap: async () => {
      if (get().isBootstrapping || get().hasBootstrapped) return;
      set({ isBootstrapping: true });
      try {
        await get().refreshSession();
      } finally {
        set({ isBootstrapping: false, hasBootstrapped: true });
      }
    },

    clearAuth: clearAuthState,
  };
});

registerAuthRefreshHandler(async () => {
  const refreshed = await useAuthStore.getState().refreshSession();
  return refreshed ? useAuthStore.getState().accessToken : null;
});

registerAuthExpiredHandler(() => {
  useAuthStore.getState().clearAuth();
});
