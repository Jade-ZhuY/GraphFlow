export type AssistantRole = 'user' | 'assistant' | 'system';

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
  createdAt: string;
}

/** 后端持久化的会话（不含消息体，消息单独拉取）。 */
export interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 后端持久化的一条消息。 */
export interface BackendMessage {
  id: string;
  conversationId: string;
  role: AssistantRole;
  content: string;
  createdAt: string;
}

/** 前端展示用会话：后端 Conversation + 本地消息缓存。 */
export interface AssistantSession {
  id: string;
  title: string;
  messages: AssistantMessage[];
  createdAt: string;
  updatedAt: string;
}
