import React from 'react';
import {
  MousePointer2,
  Circle,
  ArrowRight,
  Trash2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
} from 'lucide-react';
import { Button, Tooltip, Space } from 'antd';
import { useGraphStore } from '@/stores/useGraphStore';
import type { ToolMode } from '@/types/graph';
import './index.css';

const tools: { mode: ToolMode; icon: React.ReactNode; label: string }[] = [
  { mode: 'select', icon: <MousePointer2 size={18} />, label: '选择' },
  { mode: 'addNode', icon: <Circle size={18} />, label: '添加节点' },
  { mode: 'addEdge', icon: <ArrowRight size={18} />, label: '添加边' },
  { mode: 'delete', icon: <Trash2 size={18} />, label: '删除' },
];

const Toolbar: React.FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
  const { toolMode, setToolMode, undo, redo, history, historyIndex } =
    useGraphStore();

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div className="toolbar">
      <Space>
        {tools.map((tool) => (
          <Tooltip key={tool.mode} title={tool.label}>
            <Button
              type={toolMode === tool.mode ? 'primary' : 'default'}
              icon={tool.icon}
              onClick={() => setToolMode(tool.mode)}
              disabled={readOnly && tool.mode !== 'select'}
              className={toolMode === tool.mode ? 'tool-active' : 'tool-btn'}
            />
          </Tooltip>
        ))}
      </Space>

      <div className="toolbar-divider" />

      <Space>
        <Tooltip title="撤销 (Ctrl+Z)">
          <Button
            icon={<Undo2 size={16} />}
            onClick={undo}
            disabled={readOnly || !canUndo}
            className="tool-btn"
          />
        </Tooltip>
        <Tooltip title="重做 (Ctrl+Y)">
          <Button
            icon={<Redo2 size={16} />}
            onClick={redo}
            disabled={readOnly || !canRedo}
            className="tool-btn"
          />
        </Tooltip>
      </Space>

      <div className="toolbar-divider" />

      <Space>
        <Tooltip title="放大">
          <Button icon={<ZoomIn size={16} />} className="tool-btn" />
        </Tooltip>
        <Tooltip title="缩小">
          <Button icon={<ZoomOut size={16} />} className="tool-btn" />
        </Tooltip>
        <Tooltip title="适配画布">
          <Button icon={<Maximize size={16} />} className="tool-btn" />
        </Tooltip>
      </Space>

      <div className="toolbar-hint">
        {toolMode === 'select' && '点击选择节点或边'}
        {toolMode === 'addNode' && '点击画布空白处添加节点'}
        {toolMode === 'addEdge' && '依次点击两个节点创建连接'}
        {toolMode === 'delete' && '点击节点或边进行删除'}
      </div>
    </div>
  );
};

export default Toolbar;
