import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tooltip } from 'antd';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Clock3,
  MessageSquare,
  Mic,
  Network,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  User,
  Zap,
} from 'lucide-react';
import UserMenu from '@/components/UserMenu';
import { useAssistantStore } from '@/stores/useAssistantStore';
import type { AssistantMessage, AssistantSession } from '@/types/assistant';
import { SUGGESTED_PROMPTS } from '@/constants/assistantPrompts';
import './index.css';

function formatMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let tableRows: string[][] | null = null;
  let inTable = false;

  const flushList = () => {
    if (listItems.length === 0 || !listType) return;
    const Tag = listType;
    result.push(
      <Tag key={`list-${result.length}`} className="msg-list">
        {listItems.map((item, idx) => (
          <li key={idx}>{renderInline(item)}</li>
        ))}
      </Tag>
    );
    listItems = [];
    listType = null;
  };

  const flushTable = () => {
    if (!tableRows || tableRows.length === 0) return;
    const [header, ...rows] = tableRows;
    result.push(
      <div key={`table-${result.length}`} className="msg-table-wrap">
        <table className="msg-table">
          <thead>
            <tr>
              {header.map((cell, i) => (
                <th key={i}>{renderInline(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx}>{renderInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = null;
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (line.includes('|')) {
      const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);
      if (cells.length > 1) {
        if (!inTable) {
          flushList();
          tableRows = [];
          inTable = true;
        }
        if (cells.every((cell) => /^[-:]+$/.test(cell))) {
          continue;
        }
        tableRows!.push(cells);
        continue;
      }
    } else if (inTable) {
      flushTable();
    }

    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(olMatch[1]);
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(ulMatch[1]);
      continue;
    }

    flushList();

    if (line === '') {
      continue;
    }

    result.push(
      <p key={`p-${result.length}`} className="msg-paragraph">
        {renderInline(line)}
      </p>
    );
  }

  flushList();
  flushTable();
  return result;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*.*?\*\*|``.*?``|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('``') && token.endsWith('``')) {
      parts.push(
        <code key={key++} className="msg-inline-code">
          {token.slice(2, -2)}
        </code>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={key++} className="msg-inline-code">
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : text;
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  });
}

const EMPTY_MESSAGES: AssistantMessage[] = [];

const ChatMessage: React.FC<{ message: AssistantMessage }> = ({ message }) => {
  if (message.role === 'system') {
    return (
      <div className="assistant-chat-message system">
        <span className="assistant-system-text">{message.content}</span>
      </div>
    );
  }

  const isUser = message.role === 'user';
  return (
    <div className={`assistant-chat-message ${isUser ? 'user' : 'assistant'}`}>
      <div className="assistant-message-avatar">
        {isUser ? <User size={16} /> : <Sparkles size={16} />}
      </div>
      <div className="assistant-message-bubble">
        <div className="assistant-message-content">
          {message.content ? (
            formatMarkdown(message.content)
          ) : (
            <span className="message-typing-cursor" />
          )}
        </div>
      </div>
    </div>
  );
};

const TypingIndicator: React.FC = () => (
  <div className="assistant-chat-message assistant">
    <div className="assistant-message-avatar">
      <Sparkles size={16} />
    </div>
    <div className="assistant-message-bubble typing-bubble">
      <div className="typing-dots">
        <span />
        <span />
        <span />
      </div>
    </div>
  </div>
);

const AssistantSidebar: React.FC<{
  className?: string;
  sessions: AssistantSession[];
  activeSessionId: string;
  isGenerating: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onProjects: () => void;
  onGraphRag: () => void;
}> = ({
  className,
  sessions,
  activeSessionId,
  isGenerating,
  searchValue,
  onSearchChange,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onProjects,
  onGraphRag,
}) => {
  const query = searchValue.trim().toLowerCase();
  const filteredSessions = sessions.filter((session) =>
    session.title.toLowerCase().includes(query)
  );

  return (
    <aside className={`assistant-sidebar ${className ?? ''}`}>
      <label className="assistant-search">
        <Search size={17} />
        <input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索..."
        />
        <span>Ctrl K</span>
      </label>

      <button
        type="button"
        className="assistant-new-chat"
        onClick={onNewSession}
        disabled={isGenerating}
      >
        <Plus size={20} />
        <span>新对话</span>
        <kbd>Ctrl Shift K</kbd>
      </button>

      <button type="button" className="assistant-side-link" onClick={onProjects}>
        <Network size={18} />
        <span>知识图谱设计</span>
      </button>

      <button type="button" className="assistant-side-link" onClick={onGraphRag}>
        <Search size={18} />
        <span>GraphRAG 检索</span>
      </button>

      <div className="assistant-history-title">历史会话</div>
      <div className="assistant-history-list">
        {filteredSessions.map((session) => {
          const active = session.id === activeSessionId;
          return (
            <div
              key={session.id}
              className={`assistant-history-item ${active ? 'active' : ''}`}
            >
              <button
                type="button"
                className="assistant-history-main"
                onClick={() => onSelectSession(session.id)}
                disabled={isGenerating && !active}
              >
                <MessageSquare size={15} />
                <span>{session.title}</span>
                <time>{formatSessionTime(session.updatedAt)}</time>
              </button>
              <Tooltip title="删除对话">
                <button
                  type="button"
                  className="assistant-history-delete"
                  onClick={() => onDeleteSession(session.id)}
                  disabled={isGenerating && active}
                  aria-label={`删除 ${session.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </Tooltip>
            </div>
          );
        })}
        {filteredSessions.length === 0 && (
          <div className="assistant-history-empty">没有匹配的历史对话</div>
        )}
      </div>

      <div className="assistant-sidebar-user">
        <UserMenu />
      </div>
    </aside>
  );
};

const AssistantComposer: React.FC<{
  value: string;
  isGenerating: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onProjects: () => void;
  onGraphRag: () => void;
}> = ({
  value,
  isGenerating,
  onChange,
  onSend,
  onKeyDown,
  textareaRef,
  onProjects,
  onGraphRag,
}) => (
  <div className="assistant-composer-shell">
    <div className="assistant-composer">
      <textarea
        ref={textareaRef}
        className="assistant-textarea"
        placeholder="发消息..."
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        disabled={isGenerating}
      />
      <div className="assistant-composer-tools">
        <button type="button" className="assistant-tool-icon" aria-label="添加">
          <Plus size={24} />
        </button>
        <button type="button" className="assistant-tool">
          <Zap size={16} />
          <span>快速</span>
        </button>
        <button type="button" className="assistant-tool" onClick={onProjects}>
          <Network size={16} />
          <span>图谱设计</span>
        </button>
        <button type="button" className="assistant-tool" onClick={onGraphRag}>
          <BookOpen size={16} />
          <span>GraphRAG</span>
        </button>
        <button type="button" className="assistant-tool">
          <Bot size={16} />
          <span>深度分析</span>
        </button>
        <button type="button" className="assistant-tool">
          <Clock3 size={16} />
          <span>更多</span>
        </button>
        <button
          type="button"
          className="assistant-send-round"
          onClick={onSend}
          disabled={!value.trim() || isGenerating}
          aria-label="发送"
        >
          {isGenerating ? <Mic size={18} /> : <Send size={18} />}
        </button>
      </div>
    </div>
  </div>
);

const AssistantPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    sessions,
    activeSessionId,
    isGenerating,
    fetchConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    sendUserMessage,
  } = useAssistantStore();
  const [inputValue, setInputValue] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ?? sessions[0];
  const messages = activeSession?.messages ?? EMPTY_MESSAGES;
  const hasOnlyWelcome =
    messages.length === 1 && messages[0]?.role === 'assistant';
  const isEmptySession = messages.length === 0 || hasOnlyWelcome;

  useEffect(() => {
    // 挂载时若还没有会话（如刷新页面），从后端拉取会话列表
    if (useAssistantStore.getState().sessions.length === 0) {
      void fetchConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSessionId, messages, isGenerating]);

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isGenerating) return;
    setInputValue('');
    await sendUserMessage(trimmed);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handlePromptClick = (prompt: string) => {
    if (isGenerating) return;
    setInputValue('');
    void sendUserMessage(prompt);
  };

  const goProjects = () => navigate('/projects');
  const goGraphRag = () => navigate('/graphrag');

  return (
    <div className="assistant-page">
      <AssistantSidebar
        className={isMobileSidebarOpen ? 'mobile-open' : ''}
        sessions={sessions}
        activeSessionId={activeSessionId ?? ''}
        isGenerating={isGenerating}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onNewSession={createConversation}
        onSelectSession={(sessionId) => {
          void selectConversation(sessionId);
          setIsMobileSidebarOpen(false);
        }}
        onDeleteSession={(sessionId) => void deleteConversation(sessionId)}
        onProjects={goProjects}
        onGraphRag={goGraphRag}
      />

      <main className="assistant-main">
        <header className="assistant-topbar">
          <button
            type="button"
            className="assistant-mobile-history"
            onClick={() => setIsMobileSidebarOpen(true)}
          >
            历史
          </button>
          <button
            type="button"
            className="assistant-back-link"
            onClick={() => navigate('/')}
          >
            <ArrowLeft size={16} />
            返回
          </button>
          <h1>图谱咨询助手</h1>
          <span className="assistant-ai-note">AI 生成可能有误 请核实</span>
          <Tooltip title="删除当前对话">
            <button
              type="button"
              className="assistant-clear-current"
              onClick={() => {
                if (activeSessionId) void deleteConversation(activeSessionId);
              }}
              disabled={isGenerating}
            >
              <Trash2 size={16} />
              删除
            </button>
          </Tooltip>
        </header>

        <section className="assistant-chat-stage">
          {isEmptySession && !isGenerating ? (
            <div className="assistant-welcome">
              <h2>有什么我能帮你的吗?</h2>
              <div className="assistant-suggestion-grid">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="assistant-suggestion-pill"
                    onClick={() => handlePromptClick(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="assistant-messages-list">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              {isGenerating &&
                messages[messages.length - 1]?.role !== 'assistant' && (
                  <TypingIndicator />
                )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        <AssistantComposer
          value={inputValue}
          isGenerating={isGenerating}
          onChange={setInputValue}
          onSend={() => void handleSend()}
          onKeyDown={handleKeyDown}
          textareaRef={textareaRef}
          onProjects={goProjects}
          onGraphRag={goGraphRag}
        />
      </main>

      {isMobileSidebarOpen && (
        <button
          type="button"
          className="assistant-sidebar-scrim"
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-label="关闭历史会话"
        />
      )}
    </div>
  );
};

export default AssistantPage;
