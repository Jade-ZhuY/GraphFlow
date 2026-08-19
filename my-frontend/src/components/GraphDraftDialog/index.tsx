import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Modal, Tag, message } from 'antd';
import * as projectApi from '@/services/projectApi';
import { getApiErrorMessage } from '@/services/http';
import type { GraphDraft } from '@/types/assistant';
import './index.css';

interface GraphDraftDialogProps {
  open: boolean;
  draft: GraphDraft | null;
  onClose: () => void;
}

/**
 * 图谱草稿预览弹窗：展示 build_graph 意图提取的节点/边，
 * 输入项目名确认后新建项目并写入（createProject + saveProjectGraph）。
 */
const GraphDraftDialog: React.FC<GraphDraftDialogProps> = ({
  open,
  draft,
  onClose,
}) => {
  const navigate = useNavigate();
  const [form] = Form.useForm<{ name: string }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      form.setFieldsValue({ name: draft?.title ?? '' });
    }
  }, [open, draft, form]);

  const handleSave = async () => {
    if (!draft) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      // 补节点坐标（网格散开布局）；边沿用后端保证的节点 id 引用
      const nodes = draft.nodes.map((node, idx) => ({
        ...node,
        x: 100 + (idx % 5) * 120,
        y: 100 + Math.floor(idx / 5) * 120,
      }));
      const project = await projectApi.createProject({ name: values.name });
      await projectApi.saveProjectGraph(project.id, {
        nodes,
        edges: draft.edges,
      });
      message.success('图谱已保存');
      onClose();
      navigate(`/editor/${project.id}`);
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="图谱草稿预览"
      open={open}
      onOk={() => void handleSave()}
      confirmLoading={saving}
      onCancel={onClose}
      okText="保存为项目"
      cancelText="取消"
      destroyOnHidden
      width={560}
    >
      {draft && (
        <div className="graph-draft">
          <Form form={form} layout="vertical">
            <Form.Item
              name="name"
              label="项目名称"
              rules={[{ required: true, message: '请输入项目名称' }]}
            >
              <Input placeholder="给这个图谱起个名字" maxLength={160} />
            </Form.Item>
          </Form>

          <div className="graph-draft-summary">
            共 <strong>{draft.nodes.length}</strong> 个节点、{' '}
            <strong>{draft.edges.length}</strong> 条边
          </div>

          <div className="graph-draft-section">
            <h4 className="graph-draft-section-title">节点</h4>
            <ul className="graph-draft-node-list">
              {draft.nodes.map((node) => (
                <li key={node.id} className="graph-draft-node-item">
                  <span className="graph-draft-node-label">{node.label}</span>
                  {node.rdfType && (
                    <Tag className="graph-draft-node-type">{node.rdfType}</Tag>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="graph-draft-section">
            <h4 className="graph-draft-section-title">关系</h4>
            <ul className="graph-draft-edge-list">
              {draft.edges.map((edge) => {
                const sourceLabel =
                  draft.nodes.find((node) => node.id === edge.source)?.label ??
                  edge.source;
                const targetLabel =
                  draft.nodes.find((node) => node.id === edge.target)?.label ??
                  edge.target;
                return (
                  <li key={edge.id} className="graph-draft-edge-item">
                    <span className="edge-source">{sourceLabel}</span>
                    <span className="edge-arrow">—</span>
                    <span className="edge-label">{edge.label}</span>
                    <span className="edge-arrow">→</span>
                    <span className="edge-target">{targetLabel}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default GraphDraftDialog;
