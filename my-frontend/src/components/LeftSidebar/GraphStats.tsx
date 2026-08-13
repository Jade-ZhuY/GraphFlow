import React from 'react';
import { useGraphStore } from '@/stores/useGraphStore';
import { getGraphDensity } from '@/utils/graphHelpers';
import { BarChart3 } from 'lucide-react';

const GraphStats: React.FC = () => {
  const { nodes, edges } = useGraphStore();
  const density = getGraphDensity(nodes.length, edges.length);

  return (
    <div className="sidebar-section">
      <div className="sidebar-header">
        <span className="sidebar-title">
          <BarChart3 size={14} /> 统计
        </span>
      </div>
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-value">{nodes.length}</span>
          <span className="stat-label">节点</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{edges.length}</span>
          <span className="stat-label">边</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{density.toFixed(3)}</span>
          <span className="stat-label">密度</span>
        </div>
      </div>
    </div>
  );
};

export default GraphStats;
