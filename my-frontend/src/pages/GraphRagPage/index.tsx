import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Empty,
  message,
  Select,
  Spin,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import {
  ArrowLeft,
  Search,
  Trash2,
  Network,
  FileQuestion,
  Lightbulb,
} from 'lucide-react';
import UserMenu from '@/components/UserMenu';
import { useProjectStore } from '@/stores/useProjectStore';
import { getApiErrorMessage } from '@/services/http';
import { queryGraph } from '@/services/graphragApi';
import type { GraphProject } from '@/types/graph';
import type { RagSearchResult } from '@/types/graphRag';
import './index.css';

const SAMPLE_QUERIES = [
  'Alice 参与了哪些项目？',
  'TechCorp 有哪些员工？',
  '张三认识谁？',
];

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
      <Tag key={`list-${result.length}`} className="rag-markdown-list">
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
      <div key={`table-${result.length}`} className="rag-markdown-table-wrap">
        <table className="rag-markdown-table">
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
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (cells.length > 1) {
        if (!inTable) {
          flushList();
          tableRows = [];
          inTable = true;
        }
        if (cells.every((c) => /^[-:]+$/.test(c))) {
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
      <p key={`p-${result.length}`} className="rag-markdown-paragraph">
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
      parts.push(
        <span key={key++}>{text.slice(lastIndex, match.index)}</span>
      );
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('``') && token.endsWith('``')) {
      parts.push(
        <code key={key++} className="rag-markdown-code">
          {token.slice(2, -2)}
        </code>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={key++} className="rag-markdown-code">
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

function getNodeLabel(project: GraphProject, nodeId: string): string {
  return project.nodes.find((n) => n.id === nodeId)?.label ?? nodeId;
}

const GraphRagPage: React.FC = () => {
  const navigate = useNavigate();
  const { projects, fetchProjects, isLoading } = useProjectStore();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projects.length > 0 ? projects[0].id : null
  );
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RagSearchResult | null>(null);
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void fetchProjects().catch((error) => {
      message.error(getApiErrorMessage(error));
    });
  }, [fetchProjects]);

  const activeProjectId = useMemo(() => {
    if (selectedProjectId && projects.some((p) => p.id === selectedProjectId)) {
      return selectedProjectId;
    }
    return projects[0]?.id ?? null;
  }, [projects, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed || !activeProjectId) return;
    setLoading(true);
    setStreamingAnswer('');
    setResult(null);
    try {
      await queryGraph(activeProjectId, trimmed, {
        onChunk: (chunk) =>
          setStreamingAnswer((prev) => prev + chunk),
        onSubgraph: (data) => setResult(data),
        onDone: () => setLoading(false),
        onError: (msg) => {
          message.error(msg);
          setLoading(false);
        },
      });
    } catch {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleClear = () => {
    setResult(null);
    setStreamingAnswer('');
    setQuery('');
    textareaRef.current?.focus();
  };

  const handleSampleClick = (sample: string) => {
    setQuery(sample);
    textareaRef.current?.focus();
  };

  const projectOptions = useMemo(
    () =>
      projects.map((p) => ({
        value: p.id,
        label: `${p.name}（${p.nodes.length} 节点 / ${p.edges.length} 边）`,
      })),
    [projects]
  );

  return (
    <div className="graph-rag-page">
      <div className="graph-rag-header">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => navigate('/')}
          className="graph-rag-back-btn"
        >
          返回
        </Button>

        <div className="graph-rag-title">
          <Network size={20} className="title-icon" />
          <span>GraphRAG 图谱检索</span>
        </div>

        <div className="graph-rag-actions">
          <Tooltip title="清空结果">
            <Button
              type="text"
              icon={<Trash2 size={16} />}
              onClick={handleClear}
              className="graph-rag-clear-btn"
              disabled={loading}
            >
              清空
            </Button>
          </Tooltip>
          <UserMenu />
        </div>
      </div>

      <div className="graph-rag-body">
        {isLoading ? (
          <div className="graph-rag-empty">
            <Spin size="large" />
          </div>
        ) : projects.length === 0 ? (
          <div className="graph-rag-empty">
            <Empty
              image={<FileQuestion size={64} className="empty-icon" />}
              description={
                <div className="empty-desc">
                  <p>暂无知识图谱项目</p>
                  <p className="empty-hint">
                    先去创建一个项目，再来使用 GraphRAG 检索吧
                  </p>
                </div>
              }
            />
          </div>
        ) : (
          <div className="graph-rag-container">
            <div className="graph-rag-search-panel">
              <div className="search-row">
                <div className="search-field project-field">
                  <label className="field-label">选择项目</label>
                  <Select
                    className="project-select"
                    popupClassName="project-select-dropdown"
                    options={projectOptions}
                    value={activeProjectId}
                    onChange={(value) => setSelectedProjectId(value)}
                    placeholder="请选择项目"
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? '')
                        .toLowerCase()
                        .includes(input.toLowerCase())
                    }
                  />
                </div>

                <div className="search-field query-field">
                  <label className="field-label">检索问题</label>
                  <div className="query-input-wrap">
                    <textarea
                      ref={textareaRef}
                      className="query-textarea"
                      rows={2}
                      placeholder="输入自然语言问题，按 Enter 检索，Shift+Enter 换行"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={loading}
                    />
                    <Button
                      type="primary"
                      icon={<Search size={16} />}
                      onClick={handleSearch}
                      loading={loading}
                      disabled={!query.trim() || !selectedProject}
                      className="search-btn"
                    >
                      搜索
                    </Button>
                  </div>
                </div>
              </div>

              <div className="sample-queries">
                <span className="sample-label">
                  <Lightbulb size={14} />
                  示例查询
                </span>
                <div className="sample-tags">
                  {SAMPLE_QUERIES.map((sample) => (
                    <Tag
                      key={sample}
                      className="sample-tag"
                      onClick={() => handleSampleClick(sample)}
                    >
                      {sample}
                    </Tag>
                  ))}
                </div>
              </div>
            </div>

            <div className="graph-rag-results-panel">
              <Spin spinning={loading} tip="正在检索图谱…">
                {!result ? (
                  <div className="results-placeholder">
                    <Empty
                      image={<Search size={56} className="empty-icon" />}
                      description={
                        <div className="empty-desc">
                          <p>输入问题开始检索</p>
                          <p className="empty-hint">
                            选择项目并输入查询后，结果将展示在这里
                          </p>
                        </div>
                      }
                    />
                  </div>
                ) : (
                  <Tabs
                    className="graph-rag-tabs"
                    items={[
                      {
                        key: 'answer',
                        label: '生成回答',
                        children: (
                          <div className="tab-answer">
                            <div className="answer-content">
                              {formatMarkdown(streamingAnswer || result.answer)}
                            </div>
                          </div>
                        ),
                      },
                      {
                        key: 'matches',
                        label: `匹配结果（${result.matchedNodes.length + result.matchedEdges.length}）`,
                        children: (
                          <div className="tab-matches">
                            {result.matchedNodes.length > 0 && (
                              <div className="match-section">
                                <h4 className="match-section-title">
                                  匹配节点（{result.matchedNodes.length}）
                                </h4>
                                <div className="match-node-list">
                                  {result.matchedNodes.map((node) => (
                                    <Card
                                      key={node.id}
                                      className="match-node-card"
                                      size="small"
                                      title={
                                        <span className="node-card-title">
                                          {node.label}
                                        </span>
                                      }
                                    >
                                      {node.rdfType && (
                                        <div className="node-card-row">
                                          <span className="node-card-key">
                                            类型
                                          </span>
                                          <Tag className="node-card-type">
                                            {node.rdfType}
                                          </Tag>
                                        </div>
                                      )}
                                      {node.uri && (
                                        <div className="node-card-row">
                                          <span className="node-card-key">
                                            URI
                                          </span>
                                          <span
                                            className="node-card-value uri"
                                            title={node.uri}
                                          >
                                            {node.uri}
                                          </span>
                                        </div>
                                      )}
                                      {node.properties &&
                                        Object.keys(node.properties).length >
                                          0 && (
                                          <div className="node-card-props">
                                            {Object.entries(
                                              node.properties
                                            ).map(([k, v]) => (
                                              <div
                                                key={k}
                                                className="node-card-row"
                                              >
                                                <span className="node-card-key">
                                                  {k}
                                                </span>
                                                <span className="node-card-value">
                                                  {String(v)}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                    </Card>
                                  ))}
                                </div>
                              </div>
                            )}

                            {result.matchedEdges.length > 0 && (
                              <div className="match-section">
                                <h4 className="match-section-title">
                                  匹配关系（{result.matchedEdges.length}）
                                </h4>
                                <ul className="match-edge-list">
                                  {result.matchedEdges.map((edge) => {
                                    const sourceLabel = selectedProject
                                      ? getNodeLabel(selectedProject, edge.source)
                                      : edge.source;
                                    const targetLabel = selectedProject
                                      ? getNodeLabel(selectedProject, edge.target)
                                      : edge.target;
                                    return (
                                      <li key={edge.id} className="match-edge-item">
                                        <span className="edge-source">
                                          {sourceLabel}
                                        </span>
                                        <span className="edge-arrow">→</span>
                                        <span className="edge-label">
                                          {edge.label}
                                        </span>
                                        <span className="edge-arrow">→</span>
                                        <span className="edge-target">
                                          {targetLabel}
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}

                            {result.matchedNodes.length === 0 &&
                              result.matchedEdges.length === 0 && (
                                <Empty
                                  description="未找到直接匹配的节点或关系"
                                  className="match-empty"
                                />
                              )}
                          </div>
                        ),
                      },
                      {
                        key: 'subgraph',
                        label: `子图预览（${result.subgraph.nodes.length}/${result.subgraph.edges.length}）`,
                        children: (
                          <div className="tab-subgraph">
                            <div className="subgraph-summary">
                              子图共包含{' '}
                              <strong>{result.subgraph.nodes.length}</strong>{' '}
                              个节点、{' '}
                              <strong>{result.subgraph.edges.length}</strong>{' '}
                              条边
                            </div>

                            {result.subgraph.nodes.length > 0 && (
                              <div className="subgraph-section">
                                <h4 className="subgraph-section-title">
                                  节点列表
                                </h4>
                                <ul className="subgraph-node-list">
                                  {result.subgraph.nodes.map((node) => (
                                    <li key={node.id} className="subgraph-node-item">
                                      <span className="subgraph-node-label">
                                        {node.label}
                                      </span>
                                      {node.rdfType && (
                                        <Tag className="subgraph-node-type">
                                          {node.rdfType}
                                        </Tag>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {result.subgraph.edges.length > 0 && (
                              <div className="subgraph-section">
                                <h4 className="subgraph-section-title">
                                  关系列表
                                </h4>
                                <ul className="subgraph-edge-list">
                                  {result.subgraph.edges.map((edge) => {
                                    const sourceLabel = selectedProject
                                      ? getNodeLabel(
                                          selectedProject,
                                          edge.source
                                        )
                                      : edge.source;
                                    const targetLabel = selectedProject
                                      ? getNodeLabel(
                                          selectedProject,
                                          edge.target
                                        )
                                      : edge.target;
                                    return (
                                      <li key={edge.id} className="subgraph-edge-item">
                                        <span className="edge-source">
                                          {sourceLabel}
                                        </span>
                                        <span className="edge-arrow">—</span>
                                        <span className="edge-label">
                                          {edge.label}
                                        </span>
                                        <span className="edge-arrow">→</span>
                                        <span className="edge-target">
                                          {targetLabel}
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                          </div>
                        ),
                      },
                    ]}
                  />
                )}
              </Spin>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GraphRagPage;
