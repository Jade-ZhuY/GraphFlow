import { getAuthAccessToken } from '@/services/authSession';
import type { RagSearchResult } from '@/types/graphRag';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export interface GraphRagStreamHandlers {
  onChunk: (content: string) => void;
  /** 子图数据（节点/边），前端即刻渲染预览。 */
  onSubgraph: (data: RagSearchResult) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/**
 * 发送图谱检索请求并消费 SSE 流。
 * 每个 content chunk 触发 onChunk，子图数据触发 onSubgraph，
 * 结束触发 onDone，出错触发 onError。
 */
export async function queryGraph(
  projectId: string,
  query: string,
  handlers: GraphRagStreamHandlers
): Promise<void> {
  const token = getAuthAccessToken();
  if (!token) {
    handlers.onError('登录状态已失效，请重新登录');
    return;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/graphrag/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ projectId, query }),
    });
  } catch {
    handlers.onError('网络请求失败，请检查后端服务');
    return;
  }

  if (!response.ok) {
    let message = '请求失败';
    try {
      const body = (await response.json()) as { message?: string };
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
            data?: RagSearchResult;
          };
          if (payload.type === 'chunk' && payload.content) {
            handlers.onChunk(payload.content);
          } else if (payload.type === 'subgraph' && payload.data) {
            handlers.onSubgraph(payload.data);
          } else if (payload.type === 'error') {
            handlers.onError(payload.message || '检索失败');
          }
        } catch {
          // 忽略无法解析的帧
        }
      }
    }
    if (!finished) {
      handlers.onDone();
    }
  } catch {
    handlers.onError('连接中断');
  }
}

/**
 * 多项目检索：遍历用户所有项目，汇总检索结果。
 */
export async function queryAllGraph(
  query: string,
  handlers: GraphRagStreamHandlers
): Promise<void> {
  const token = getAuthAccessToken();
  if (!token) {
    handlers.onError('登录状态已失效，请重新登录');
    return;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/graphrag/query-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    });
  } catch {
    handlers.onError('网络请求失败，请检查后端服务');
    return;
  }

  if (!response.ok) {
    let message = '请求失败';
    try {
      const body = (await response.json()) as { message?: string };
      message = body.message || message;
    } catch {
      // ignore
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
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

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
            data?: Record<string, unknown>;
          };
          if (payload.type === 'chunk' && payload.content) {
            handlers.onChunk(payload.content);
          } else if (payload.type === 'subgraph' && payload.data) {
            handlers.onSubgraph(payload.data as unknown as RagSearchResult);
          } else if (payload.type === 'error') {
            handlers.onError(payload.message || '检索失败');
          }
        } catch {
          // ignore
        }
      }
    }
    if (!finished) {
      handlers.onDone();
    }
  } catch {
    handlers.onError('连接中断');
  }
}