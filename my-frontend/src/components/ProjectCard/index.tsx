import React, { useState } from 'react';
import { Card, Tag, Button, Popconfirm, Dropdown, message } from 'antd';
import {
  ArrowRight,
  Trash2,
  Network,
  Share2,
  Download,
} from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import * as projectApi from '@/services/projectApi';
import { getApiErrorMessage } from '@/services/http';
import type { GraphProject, ProjectRole } from '@/types/graph';
import './index.css';

interface ProjectCardProps {
  project: GraphProject;
  onEnter: (id: string) => void;
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
}

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: '我的',
  editor: '可编辑',
  viewer: '只读',
};

const ROLE_COLOR: Record<ProjectRole, string> = {
  owner: 'green',
  editor: 'blue',
  viewer: 'default',
};

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onEnter,
  onDelete,
  onShare,
}) => {
  const role: ProjectRole = project.myRole ?? 'owner';
  const canManage = role === 'owner';
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: 'turtle' | 'jsonld' | 'json') => {
    setExporting(true);
    try {
      const blob = await projectApi.exportProject(project.id, format);
      const ext = format === 'turtle' ? 'ttl' : format === 'jsonld' ? 'jsonld' : 'json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  // 统一提供三种导出格式（Turtle / JSON-LD / JSON）
  const exportFormats = [
    { key: 'turtle', label: 'Turtle (.ttl)' },
    { key: 'jsonld', label: 'JSON-LD (.jsonld)' },
    { key: 'json', label: 'JSON (.json)' },
  ];

  const exportMenu = {
    items: exportFormats.map((f) => ({
      key: f.key,
      label: f.label,
      onClick: () => handleExport(f.key as 'turtle' | 'jsonld' | 'json'),
    })),
  };

  const actions = [
    <Button
      key="enter"
      type="text"
      icon={<ArrowRight size={16} />}
      onClick={() => onEnter(project.id)}
    >
      进入设计
    </Button>,
    <Dropdown key="export" menu={exportMenu} trigger={['click']}>
      <Button type="text" icon={<Download size={16} />} loading={exporting}>
        导出
      </Button>
    </Dropdown>,
  ];

  if (canManage) {
    actions.push(
      <Button
        key="share"
        type="text"
        icon={<Share2 size={16} />}
        onClick={() => onShare(project.id)}
      >
        分享
      </Button>,
      <Popconfirm
        key="delete"
        title="确认删除"
        description="删除后无法恢复，是否继续？"
        onConfirm={() => onDelete(project.id)}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Button type="text" danger icon={<Trash2 size={16} />}>
          删除
        </Button>
      </Popconfirm>
    );
  }

  return (
    <Card className="project-card" hoverable actions={actions}>
      <div className="project-card-header">
        <Network size={20} className="project-icon" />
        <h3 className="project-name">{project.name}</h3>
        {!canManage && (
          <Tag color={ROLE_COLOR[role]} className="project-role-tag">
            {ROLE_LABEL[role]}
          </Tag>
        )}
      </div>
      {project.description && (
        <p className="project-desc">{project.description}</p>
      )}
      <div className="project-meta">
        <span className="project-stats">
          {project.nodes.length} 节点 · {project.edges.length} 边
        </span>
      </div>
      <div className="project-date">
        {format(new Date(project.createdAt), 'yyyy年MM月dd日 HH:mm', {
          locale: zhCN,
        })}
      </div>
    </Card>
  );
};

export default ProjectCard;
