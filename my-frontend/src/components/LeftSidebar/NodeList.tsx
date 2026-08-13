import React from 'react';
import { List, Button, Input, Empty } from 'antd';
import { Search, MapPin, Trash2 } from 'lucide-react';
import { useGraphStore } from '@/stores/useGraphStore';
import { generateId } from '@/utils/idGenerator';

const NodeList: React.FC = () => {
  const {
    nodes,
    selectedNodeId,
    toolMode,
    selectNode,
    removeNode,
    chooseEdgeEndpoint,
  } = useGraphStore();
  const [search, setSearch] = React.useState('');

  const filtered = nodes.filter((n) =>
    n.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="sidebar-section">
      <div className="sidebar-header">
        <span className="sidebar-title">
          <MapPin size={14} /> 节点 ({nodes.length})
        </span>
      </div>
      <Input
        prefix={<Search size={14} />}
        placeholder="搜索节点..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        style={{ marginBottom: 8 }}
      />
      {filtered.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无节点" />
      ) : (
        <List
          size="small"
          dataSource={filtered}
          renderItem={(node) => (
            <List.Item
              className={`list-item ${selectedNodeId === node.id ? 'list-item-selected' : ''}`}
              onClick={() => {
                if (toolMode === 'addEdge') {
                  chooseEdgeEndpoint(node.id, generateId());
                  return;
                }
                selectNode(node.id);
              }}
              actions={[
                <Button
                  key="del"
                  type="text"
                  size="small"
                  danger
                  icon={<Trash2 size={12} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeNode(node.id);
                  }}
                />,
              ]}
            >
              <List.Item.Meta
                title={
                  <span className="list-item-title">{node.label}</span>
                }
                description={
                  <span className="list-item-desc">ID: {node.id}</span>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );
};

export default NodeList;
