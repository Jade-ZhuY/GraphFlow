import React from 'react';
import { Empty } from 'antd';
import { MousePointer2 } from 'lucide-react';
import { useGraphStore } from '@/stores/useGraphStore';
import NodeEditor from './NodeEditor';
import EdgeEditor from './EdgeEditor';
import './index.css';

const RightPanel: React.FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
  const { selectedNodeId, selectedEdgeId } = useGraphStore();

  const hasSelection = selectedNodeId || selectedEdgeId;

  return (
    <div className="right-panel">
      {readOnly && (
        <div className="right-panel-readonly">只读模式 · 仅查看属性</div>
      )}
      {hasSelection ? (
        <>
          {selectedNodeId && <NodeEditor />}
          {selectedEdgeId && <EdgeEditor />}
        </>
      ) : (
        <div className="right-panel-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="empty-content">
                <MousePointer2 size={24} style={{ marginBottom: 8 }} />
                <p>在画布上选择一个节点或边</p>
                <p className="empty-hint">以查看和编辑其属性</p>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
};

export default RightPanel;
