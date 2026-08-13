import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssistantStore } from '@/stores/useAssistantStore';
import * as assistantApi from '@/services/assistantApi';
import type { Conversation } from '@/types/assistant';

vi.mock('@/services/assistantApi', () => ({
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  listMessages: vi.fn(),
  chatStream: vi.fn(),
}));

const mockedApi = vi.mocked(assistantApi);

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv_1',
    title: '测试会话',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

function resetStore() {
  useAssistantStore.getState().clearConversations();
}

describe('useAssistantStore', () => {
  beforeEach(() => {
    resetStore();
    mockedApi.listConversations.mockReset();
    mockedApi.createConversation.mockReset();
    mockedApi.deleteConversation.mockReset();
    mockedApi.listMessages.mockReset();
    mockedApi.chatStream.mockReset();
  });

  it('starts empty with no active conversation', () => {
    const state = useAssistantStore.getState();
    expect(state.sessions).toEqual([]);
    expect(state.activeSessionId).toBeNull();
    expect(state.isGenerating).toBe(false);
  });

  it('fetches conversations from the backend and loads the first messages', async () => {
    const conv = makeConversation();
    mockedApi.listConversations.mockResolvedValue([conv]);
    mockedApi.listMessages.mockResolvedValue([
      {
        id: 'msg_1',
        conversationId: conv.id,
        role: 'assistant',
        content: '你好',
        createdAt: '2026-08-05T00:00:00.000Z',
      },
    ]);

    await useAssistantStore.getState().fetchConversations();

    const state = useAssistantStore.getState();
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].id).toBe(conv.id);
    expect(state.sessions[0].title).toBe('测试会话');
    expect(state.activeSessionId).toBe(conv.id);
    // 首会话消息已加载
    expect(state.sessions[0].messages).toHaveLength(1);
    expect(state.sessions[0].messages[0].content).toBe('你好');
  });

  it('creates a conversation and selects it', async () => {
    const conv = makeConversation({ id: 'conv_new', title: null });
    mockedApi.createConversation.mockResolvedValue(conv);

    const id = await useAssistantStore.getState().createConversation();

    expect(id).toBe('conv_new');
    const state = useAssistantStore.getState();
    expect(state.activeSessionId).toBe('conv_new');
    expect(state.sessions[0].title).toBe('新对话'); // title null 兜底
  });

  it('deletes a conversation and moves selection to the next one', async () => {
    mockedApi.listConversations.mockResolvedValue([
      makeConversation({ id: 'conv_a' }),
      makeConversation({ id: 'conv_b' }),
    ]);
    await useAssistantStore.getState().fetchConversations();

    mockedApi.deleteConversation.mockResolvedValue({ deleted: true });
    await useAssistantStore.getState().deleteConversation('conv_a');

    const state = useAssistantStore.getState();
    expect(state.sessions.map((s) => s.id)).toEqual(['conv_b']);
    expect(state.activeSessionId).toBe('conv_b');
  });

  it('selects a conversation and loads its messages', async () => {
    mockedApi.listConversations.mockResolvedValue([
      makeConversation({ id: 'conv_a' }),
    ]);
    await useAssistantStore.getState().fetchConversations();

    mockedApi.listMessages.mockResolvedValue([
      {
        id: 'msg_2',
        conversationId: 'conv_a',
        role: 'user',
        content: '第二个问题',
        createdAt: '2026-08-05T00:01:00.000Z',
      },
    ]);
    await useAssistantStore.getState().selectConversation('conv_a');

    const state = useAssistantStore.getState();
    expect(state.sessions[0].messages.map((m) => m.content)).toEqual([
      '第二个问题',
    ]);
  });

  it('sendUserMessage streams SSE chunks into the active conversation', async () => {
    const conv = makeConversation();
    mockedApi.listConversations.mockResolvedValue([conv]);
    await useAssistantStore.getState().fetchConversations();

    mockedApi.chatStream.mockImplementation(
      async (_convId, _content, handlers) => {
        for (const char of '你好世界') {
          handlers.onChunk(char);
        }
        handlers.onDone();
      }
    );

    await useAssistantStore.getState().sendUserMessage('你好');

    const state = useAssistantStore.getState();
    // user + assistant 两条消息
    expect(state.sessions[0].messages).toHaveLength(2);
    expect(state.sessions[0].messages[0]).toMatchObject({
      role: 'user',
      content: '你好',
    });
    expect(state.sessions[0].messages[1].content).toBe('你好世界');
    expect(state.isGenerating).toBe(false);
  });

  it('sendUserMessage keeps partial content and shows error when SSE errors', async () => {
    const conv = makeConversation();
    mockedApi.listConversations.mockResolvedValue([conv]);
    await useAssistantStore.getState().fetchConversations();

    mockedApi.chatStream.mockImplementation(
      async (_convId, _content, handlers) => {
        handlers.onChunk('部分');
        handlers.onError('连接中断');
      }
    );

    await useAssistantStore.getState().sendUserMessage('测试');

    const state = useAssistantStore.getState();
    const assistantMsg = state.sessions[0].messages[1];
    // 已生成的部分保留，并追加中断标记
    expect(assistantMsg.content).toBe('部分\n\n（生成中断：连接中断）');
    expect(state.isGenerating).toBe(false);
  });

  it('sendUserMessage ignores blank input and does not call the API', async () => {
    const conv = makeConversation();
    mockedApi.listConversations.mockResolvedValue([conv]);
    await useAssistantStore.getState().fetchConversations();

    await useAssistantStore.getState().sendUserMessage('   ');

    expect(mockedApi.chatStream).not.toHaveBeenCalled();
  });
});
