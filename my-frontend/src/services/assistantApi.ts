import { apiRequest } from '@/services/http';
import { getAuthAccessToken } from '@/services/authSession';
import type {
  BackendMessage,
  Conversation,
} from '@/types/assistant';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

// ---- 会话与消息（标准 JSON 封装）----

export function listConversations(): Promise<Conversation[]> {
  return apiRequest<Conversation[]>({
    method: 'GET',
    url: '/api/assistant/conversations',
  });
}

export function createConversation(): Promise<Conversation> {
  return apiRequest<Conversation>({
    method: 'POST',
    url: '/api/assistant/conversations',
  });
}

export function deleteConversation(
  conversationId: string
): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>({
    method: 'DELETE',
    url: `/api/assistant/conversations/${conversationId}`,
  });
}

export function listMessages(
  conversationId: string
): Promise<BackendMessage[]> {
  return apiRequest<BackendMessage[]>({
    method: 'GET',
    url: `/api/assistant/conversations/${conversationId}/messages`,
  });
}

// ---- SSE 流式问答（绕过统一 JSON 包，手动带 token）----

export interface ChatStreamHandlers {
  onChunk: (content: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/**
 * 发送消息并消费 SSE 流。每个 content chunk 触发 onChunk，结束触发 onDone，出错触发 onError。
 */
export async function chatStream(
  conversationId: string,
  content: string,
  handlers: ChatStreamHandlers
): Promise<void> {
  const token = getAuthAccessToken();
  if (!token) {
    handlers.onError('登录状态已失效，请重新登录');
    return;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ conversationId, content }),
    });
  } catch {
    handlers.onError('网络请求失败，请检查后端服务');
    return;
  }

  if (!response.ok) {
    // 校验失败（如 403/400）返回 JSON envelope
    let message = '请求失败';
    try {
      const body = (await response.json()) as {
        message?: string;
      };
      message = body.message || message;
    } catch {
      // ignore parse errors
    }
    handlers.onError(message);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    handlers.onError('无法读取响应流');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;
  let finished = false;

  try {
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      done = streamDone;
      buffer += decoder.decode(value ?? new Uint8Array(), {
        stream: !done,
      });

      // 按 SSE 帧（空行分隔）切分
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice('data: '.length);
        if (raw === '[DONE]') {
          finished = true;
          handlers.onDone();
          continue;
        }
        try {
          const payload = JSON.parse(raw) as {
            type?: string;
            content?: string;
            message?: string;
          };
          if (payload.type === 'chunk' && payload.content) {
            handlers.onChunk(payload.content);
          } else if (payload.type === 'error') {
            handlers.onError(payload.message || '生成失败');
          }
        } catch {
          // 忽略无法解析的帧
        }
      }
    }
    // 流自然结束（未显式 [DONE]）也视为完成
    if (!finished) {
      handlers.onDone();
    }
  } catch {
    handlers.onError('连接中断');
  }
}
