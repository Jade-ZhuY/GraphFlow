import { create } from 'zustand';
import type {
  AssistantMessage,
  AssistantSession,
  BackendMessage,
  Conversation,
  GraphDraft,
} from '@/types/assistant';
import * as assistantApi from '@/services/assistantApi';
import { getApiErrorMessage } from '@/services/http';

const ERROR_REPLY = '暂时无法生成回复，请稍后重试。';

const EMPTY_CONVERSATION_TITLE = '新对话';

function toAssistantMessage(message: BackendMessage): AssistantMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };
}

function sortSessions(sessions: AssistantSession[]): AssistantSession[] {
  return [...sessions].sort(
    (a, b) => timestampMs(b.updatedAt) - timestampMs(a.updatedAt)
  );
}

function timestampMs(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

interface AssistantState {
  sessions: AssistantSession[];
  activeSessionId: string | null;
  isGenerating: boolean;
  isLoading: boolean;
  error: string | null;
  /** build_graph 意图产出的图谱草稿；非空时前端弹窗预览。 */
  graphDraft: GraphDraft | null;

  fetchConversations: () => Promise<void>;
  createConversation: () => Promise<string>;
  deleteConversation: (conversationId: string) => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  clearConversations: () => void;
  sendUserMessage: (content: string) => Promise<void>;
  appendAssistantChunk: (
    sessionId: string,
    messageId: string,
    chunk: string
  ) => void;
  finalizeAssistantMessage: (sessionId: string, messageId: string) => void;
  setGraphDraft: (draft: GraphDraft | null) => void;
}

function conversationToSession(
  conversation: Conversation,
  messages: AssistantMessage[] = []
): AssistantSession {
  return {
    id: conversation.id,
    title: conversation.title || EMPTY_CONVERSATION_TITLE,
    messages,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isGenerating: false,
  isLoading: false,
  error: null,
  graphDraft: null,

  fetchConversations: async () => {
    set({ isLoading: true, error: null });
    try {
      const conversations = await assistantApi.listConversations();
      const sessions = conversations.map((c) => conversationToSession(c));
      set((state) => ({
        sessions: sortSessions(sessions),
        isLoading: false,
        error: null,
        // 保持当前选中的会话（若仍存在）
        activeSessionId:
          state.activeSessionId &&
          sessions.some((s) => s.id === state.activeSessionId)
            ? state.activeSessionId
            : (sessions[0]?.id ?? null),
      }));
      // 自动加载当前会话的消息
      const active = get().activeSessionId;
      if (active) {
        void get().selectConversation(active);
      }
    } catch (error) {
      set({ isLoading: false, error: getApiErrorMessage(error) });
    }
  },

  createConversation: async () => {
    if (get().isGenerating) return get().activeSessionId ?? '';
    set({ error: null });
    try {
      const conversation = await assistantApi.createConversation();
      const session = conversationToSession(conversation);
      set((state) => ({
        sessions: sortSessions([session, ...state.sessions]),
        activeSessionId: session.id,
      }));
      return session.id;
    } catch (error) {
      set({ error: getApiErrorMessage(error) });
      return '';
    }
  },

  deleteConversation: async (conversationId) => {
    const state = get();
    if (state.isGenerating && state.activeSessionId === conversationId) return;
    try {
      await assistantApi.deleteConversation(conversationId);
      const remaining = sortSessions(
        state.sessions.filter((s) => s.id !== conversationId)
      );
      set({
        sessions: remaining,
        activeSessionId:
          state.activeSessionId === conversationId
            ? (remaining[0]?.id ?? null)
            : state.activeSessionId,
      });
    } catch (error) {
      set({ error: getApiErrorMessage(error) });
    }
  },

  selectConversation: async (conversationId) => {
    if (get().isGenerating) return;
    set({ activeSessionId: conversationId, error: null });
    try {
      const messages = await assistantApi.listMessages(conversationId);
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === conversationId
            ? { ...s, messages: messages.map(toAssistantMessage) }
            : s
        ),
      }));
    } catch (error) {
      set({ error: getApiErrorMessage(error) });
    }
  },

  clearConversations: () =>
    set({
      sessions: [],
      activeSessionId: null,
      isGenerating: false,
      isLoading: false,
      error: null,
      graphDraft: null,
    }),

  sendUserMessage: async (content) => {
    const trimmed = content.trim();
    if (!trimmed || get().isGenerating) return;

    // 若还没有活动会话（如首次进入、后端无会话），自动创建一个
    let conversationId = get().activeSessionId;
    if (!conversationId) {
      conversationId = await get().createConversation();
      if (!conversationId) return; // 创建失败（已设 error）
    }

    // 乐观追加用户消息
    const userMessage: AssistantMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      isGenerating: true,
      error: null,
      sessions: state.sessions.map((s) =>
        s.id === conversationId
          ? {
              ...s,
              messages: [...s.messages, userMessage],
              updatedAt: userMessage.createdAt,
            }
          : s
      ),
    }));

    // 占位 assistant 消息，流式写入
    const assistantMessageId = `local-${Date.now() + 1}`;
    const assistantMessage: AssistantMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === conversationId
          ? { ...s, messages: [...s.messages, assistantMessage] }
          : s
      ),
    }));

    try {
      await assistantApi.chatStream(conversationId, trimmed, {
        onChunk: (chunk) =>
          get().appendAssistantChunk(conversationId, assistantMessageId, chunk),
        onDone: () =>
          get().finalizeAssistantMessage(conversationId, assistantMessageId),
        onGraphDraft: (draft) => get().setGraphDraft(draft),
        onError: (message) => {
          // 已产生的部分保留并追加中断标记；若完全没生成则整条显示错误
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === conversationId
                ? {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === assistantMessageId
                        ? {
                            ...m,
                            content: m.content
                              ? `${m.content}\n\n（生成中断：${message}）`
                              : `生成失败：${message}`,
                          }
                        : m
                    ),
                  }
                : s
            ),
          }));
        },
      });
    } catch {
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === conversationId
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: ERROR_REPLY }
                    : m
                ),
              }
            : s
        ),
      }));
    } finally {
      set({ isGenerating: false });
      // 不重拉会话列表：本地乐观消息已是完整展示，标题/排序在刷新页面时经 fetchConversations 同步。
    }
  },

  appendAssistantChunk: (sessionId, messageId, chunk) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              messages: session.messages.map((message) =>
                message.id === messageId
                  ? { ...message, content: message.content + chunk }
                  : message
              ),
            }
          : session
      ),
    })),

  finalizeAssistantMessage: (sessionId, messageId) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              messages: session.messages.map((message) =>
                message.id === messageId
                  ? { ...message, content: message.content.trimEnd() }
                  : message
              ),
            }
          : session
      ),
    })),

  setGraphDraft: (draft) => set({ graphDraft: draft }),
}));
