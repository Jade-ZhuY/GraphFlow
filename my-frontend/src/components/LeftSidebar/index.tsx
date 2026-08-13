import React from 'react';
import { Tabs } from 'antd';
import NodeList from './NodeList';
import EdgeList from './EdgeList';
import GraphStats from './GraphStats';
import './index.css';

const LeftSidebar: React.FC = () => {
  return (
    <div className="left-sidebar">
      <Tabs
        defaultActiveKey="nodes"
        size="small"
        items={[
          {
            key: 'nodes',
            label: '节点',
            children: <NodeList />,
          },
          {
            key: 'edges',
            label: '边',
            children: <EdgeList />,
          },
          {
            key: 'stats',
            label: '统计',
            children: <GraphStats />,
          },
        ]}
      />
    </div>
  );
};

export default LeftSidebar;
