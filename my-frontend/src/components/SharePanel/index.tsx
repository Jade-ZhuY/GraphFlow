import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Button, List, Tag, message, Spin } from 'antd';
import { UserMinus, UserPlus, Crown } from 'lucide-react';
import * as projectApi from '@/services/projectApi';
import { getApiErrorMessage } from '@/services/http';
import type { Member, MemberRole } from '@/types/graph';
import './index.css';

interface SharePanelProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
}

const SharePanel: React.FC<SharePanelProps> = ({ projectId, open, onClose }) => {
  const [form] = Form.useForm<{ email: string; role: MemberRole }>();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const list = await projectApi.listMembers(projectId);
      setMembers(list);
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) {
      // 打开面板时加载成员列表；loadMembers 内部 setState 是必要的副作用。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadMembers();
    }
  }, [open, loadMembers]);

  const handleAdd = async (values: { email: string; role: MemberRole }) => {
    setIsSubmitting(true);
    try {
      const member = await projectApi.addMember(projectId, values);
      setMembers((prev) => [...prev, member]);
      form.resetFields();
      message.success(`已添加成员 ${member.email}`);
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (userId: string, role: MemberRole) => {
    try {
      const updated = await projectApi.updateMemberRole(projectId, userId, { role });
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? updated : m))
      );
    } catch (error) {
      message.error(getApiErrorMessage(error));
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await projectApi.removeMember(projectId, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      message.success('已移除成员');
    } catch (error) {
      message.error(getApiErrorMessage(error));
    }
  };

  return (
    <Modal
      title="分享项目"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={520}
    >
      <div className="share-owner-row">
        <Crown size={16} className="share-owner-icon" />
        <span className="share-owner-label">所有者（你自己）</span>
        <Tag color="gold">owner</Tag>
      </div>

      <Form
        form={form}
        layout="inline"
        onFinish={handleAdd}
        className="share-add-form"
        initialValues={{ role: 'viewer' }}
      >
        <Form.Item
          name="email"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '邮箱格式不正确' },
          ]}
          style={{ flex: 1 }}
        >
          <Input placeholder="协作者邮箱" />
        </Form.Item>
        <Form.Item name="role">
          <Select
            style={{ width: 110 }}
            options={[
              { value: 'editor', label: '编辑者' },
              { value: 'viewer', label: '只读者' },
            ]}
          />
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            icon={<UserPlus size={16} />}
            loading={isSubmitting}
          >
            添加
          </Button>
        </Form.Item>
      </Form>

      <div className="share-members-title">协作者</div>
      <Spin spinning={isLoading}>
        <List
          dataSource={members}
          locale={{ emptyText: '暂无协作者' }}
          renderItem={(member) => (
            <List.Item className="share-member-item">
              <div className="share-member-info">
                <span className="share-member-name">{member.displayName}</span>
                <span className="share-member-email">{member.email}</span>
              </div>
              <div className="share-member-actions">
                <Select
                  size="small"
                  value={member.role as MemberRole}
                  style={{ width: 100 }}
                  onChange={(role: MemberRole) => handleRoleChange(member.userId, role)}
                  options={[
                    { value: 'editor', label: '编辑者' },
                    { value: 'viewer', label: '只读者' },
                  ]}
                />
                <Button
                  size="small"
                  danger
                  type="text"
                  icon={<UserMinus size={16} />}
                  onClick={() => handleRemove(member.userId)}
                />
              </div>
            </List.Item>
          )}
        />
      </Spin>
    </Modal>
  );
};

export default SharePanel;
