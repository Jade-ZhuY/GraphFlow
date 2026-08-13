import React from 'react';
import { List, Button, Input, Empty } from 'antd';
import { Search, Link2, Trash2 } from 'lucide-react';
import { useGraphStore } from '@/stores/useGraphStore';

const EdgeList: React.FC = () => {
  const { edges, nodes, selectedEdgeId, selectEdge, removeEdge } = useGraphStore();
  const [search, setSearch] = React.useState('');

  const getNodeLabel = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    return node?.label || id;
  };

  const filtered = edges.filter(
    (e) =>
      e.label.toLowerCase().includes(search.toLowerCase()) ||
      getNodeLabel(e.source).toLowerCase().includes(search.toLowerCase()) ||
      getNodeLabel(e.target).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="sidebar-section">
      <div className="sidebar-header">
        <span className="sidebar-title">
          <Link2 size={14} /> 边 ({edges.length})
        </span>
      </div>
      <Input
        prefix={<Search size={14} />}
        placeholder="搜索边..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        style={{ marginBottom: 8 }}
      />
      {filtered.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无边" />
      ) : (
        <List
          size="small"
          dataSource={filtered}
          renderItem={(edge) => (
            <List.Item
              className={`list-item ${selectedEdgeId === edge.id ? 'list-item-selected' : ''}`}
              onClick={() => selectEdge(edge.id)}
              actions={[
                <Button
                  key="del"
                  type="text"
                  size="small"
                  danger
                  icon={<Trash2 size={12} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeEdge(edge.id);
                  }}
                />,
              ]}
            >
              <List.Item.Meta
                title={
                  <span className="list-item-title">{edge.label}</span>
                }
                description={
                  <span className="list-item-desc">
                    {getNodeLabel(edge.source)} → {getNodeLabel(edge.target)}
                  </span>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );
};

export default EdgeList;
