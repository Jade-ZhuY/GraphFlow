import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, Form, Input, Empty, Spin, message } from 'antd';
import { Plus, FolderOpen, Home, Search, Upload } from 'lucide-react';
import { useProjectStore } from '@/stores/useProjectStore';
import ProjectCard from '@/components/ProjectCard';
import SharePanel from '@/components/SharePanel';
import ImportProjectDialog from '@/components/ImportProjectDialog';
import UserMenu from '@/components/UserMenu';
import { getApiErrorMessage } from '@/services/http';
import './index.css';

const ProjectGallery: React.FC = () => {
  const navigate = useNavigate();
  const {
    projects,
    fetchProjects,
    createProject,
    deleteProject,
    isLoading,
    isSaving,
  } = useProjectStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [shareProjectId, setShareProjectId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    void fetchProjects().catch((error) => {
      message.error(getApiErrorMessage(error));
    });
  }, [fetchProjects]);

  // 按角色分组：owner 为「我的项目」，其余为「共享给我的」。
  const { owned, shared } = useMemo(() => {
    const owned = projects.filter((p) => p.myRole === 'owner' || !p.myRole);
    const shared = projects.filter(
      (p) => p.myRole === 'editor' || p.myRole === 'viewer'
    );
    return { owned, shared };
  }, [projects]);

  const handleCreate = async (values: {
    name: string;
    description?: string;
  }) => {
    try {
      const project = await createProject(values);
      setIsModalOpen(false);
      form.resetFields();
      navigate(`/editor/${project.id}`);
    } catch (error) {
      message.error(getApiErrorMessage(error));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProject(id);
      message.success('已删除项目');
    } catch (error) {
      message.error(getApiErrorMessage(error));
    }
  };

  return (
    <div className="project-gallery">
      <div className="gallery-header">
        <div className="gallery-brand">
          <Button
            type="text"
            icon={<Home size={18} />}
            onClick={() => navigate('/')}
            className="gallery-home-btn"
          />
          <FolderOpen size={28} className="brand-icon" />
          <h1 className="brand-title">知识图谱设计系统</h1>
        </div>
        <div className="gallery-actions">
          <Button
            size="large"
            icon={<Search size={16} />}
            onClick={() => navigate('/graphrag')}
            className="gallery-rag-btn"
          >
            GraphRAG
          </Button>
          <Button
            type="primary"
            icon={<Plus size={16} />}
            onClick={() => setIsModalOpen(true)}
            size="large"
            className="create-btn"
          >
            新建项目
          </Button>
          <Button
            icon={<Upload size={16} />}
            onClick={() => setImportOpen(true)}
            size="large"
            className="import-btn"
          >
            导入项目
          </Button>
          <UserMenu />
        </div>
      </div>

      <div className="gallery-content">
        {isLoading ? (
          <div className="gallery-empty">
            <Spin size="large" />
          </div>
        ) : projects.length === 0 ? (
          <div className="gallery-empty">
            <Empty
              description={
                <div className="empty-desc">
                  <p>暂无知识图谱项目</p>
                  <p className="empty-hint">点击右上角按钮创建你的第一个项目</p>
                </div>
              }
            />
          </div>
        ) : (
          <div className="gallery-sections">
            {owned.length > 0 && (
              <section className="gallery-section">
                <h2 className="gallery-section-title">我的项目</h2>
                <div className="project-grid">
                  {owned.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onEnter={(id) => navigate(`/editor/${id}`)}
                      onDelete={handleDelete}
                      onShare={(id) => setShareProjectId(id)}
                    />
                  ))}
                </div>
              </section>
            )}
            {shared.length > 0 && (
              <section className="gallery-section">
                <h2 className="gallery-section-title">共享给我的</h2>
                <div className="project-grid">
                  {shared.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onEnter={(id) => navigate(`/editor/${id}`)}
                      onDelete={handleDelete}
                      onShare={(id) => setShareProjectId(id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <SharePanel
        projectId={shareProjectId ?? ''}
        open={shareProjectId !== null}
        onClose={() => setShareProjectId(null)}
      />

      <ImportProjectDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void fetchProjects().catch(() => {})}
      />

      <Modal
        title="新建知识图谱项目"
        open={isModalOpen}
        onOk={() => form.submit()}
        confirmLoading={isSaving}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
        }}
        okText="创建"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
        >
          <Form.Item
            label="项目名称"
            name="name"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="我的知识图谱" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea
              rows={2}
              placeholder="简要描述这个项目的内容..."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectGallery;
