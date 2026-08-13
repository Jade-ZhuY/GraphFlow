import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, message, Modal } from 'antd';
import { ArrowLeft, Save } from 'lucide-react';
import { useProjectStore } from '@/stores/useProjectStore';
import { useGraphStore } from '@/stores/useGraphStore';
import { useEditorSyncStore } from '@/stores/useEditorSyncStore';
import { getApiErrorMessage } from '@/services/http';
import Toolbar from '@/components/Toolbar';
import LeftSidebar from '@/components/LeftSidebar';
import GraphCanvas from '@/components/GraphCanvas';
import RightPanel from '@/components/RightPanel';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import UserMenu from '@/components/UserMenu';
import { GRAPH_EDITOR_BACK_PATH } from './navigation';
import './index.css';

const GraphEditor: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const {
    getProjectById,
    fetchGraph,
    saveGraph,
    isLoading,
    isSaving,
  } = useProjectStore();
  const { setGraphData, nodes, edges } = useGraphStore();
  const {
    setSyncing: setSyncStatusSyncing,
    setSaved: setSyncStatusSaved,
    setError: setSyncStatusError,
    markEdited,
    reset: resetSyncStatus,
    hasEditedSinceLastSync,
  } = useEditorSyncStore();

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const loadedProjectIdRef = useRef<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  const project = getProjectById(projectId || '');

  useEffect(() => {
    if (!projectId) {
      message.error('项目不存在');
      navigate('/projects');
      return;
    }

    if (project) {
      if (loadedProjectIdRef.current !== project.id) {
        setGraphData(project.nodes, project.edges);
        loadedProjectIdRef.current = project.id;
        // 切换/加载项目后，画布以后端数据为准，同步状态归位 saved。
        resetSyncStatus();
      }
      return;
    }

    let active = true;
    void fetchGraph(projectId)
      .then((loadedProject) => {
        if (!active) return;
        setGraphData(loadedProject.nodes, loadedProject.edges);
        loadedProjectIdRef.current = loadedProject.id;
        resetSyncStatus();
      })
      .catch((error) => {
        if (!active) return;
        message.error(getApiErrorMessage(error));
        navigate('/projects');
      });

    return () => {
      active = false;
    };
  }, [fetchGraph, navigate, project, projectId, setGraphData, resetSyncStatus]);

  useEffect(() => {
    const updateSize = () => {
      if (canvasContainerRef.current) {
        const rect = canvasContainerRef.current.getBoundingClientRect();
        setCanvasSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // 离开确认：自上次成功同步后发生过编辑时，拦截浏览器刷新/关闭。
  // 因节点/边 mutation 即时同步后端，判据是「是否编辑过」而非「是否有未保存数据」——
  // 保存成功后 hasEditedSinceLastSync 被清零，离开不再弹确认。
  // 注：路由内跳转（返回按钮）用 Modal.confirm 拦截，见 handleBack。
  const shouldBlockLeave = hasEditedSinceLastSync;

  useEffect(() => {
    if (!shouldBlockLeave) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [shouldBlockLeave]);

  const handleSave = async () => {
    if (!projectId) return;
    // 只读者不能保存
    if ((project?.myRole ?? 'owner') === 'viewer') {
      message.warning('只读模式下不能保存');
      return;
    }
    markEdited();
    setSyncStatusSyncing();
    try {
      const savedProject = await saveGraph(projectId, {
        nodes,
        edges,
      });
      setGraphData(savedProject.nodes, savedProject.edges);
      loadedProjectIdRef.current = savedProject.id;
      setSyncStatusSaved();
      message.success('已保存');
    } catch (error) {
      setSyncStatusError(getApiErrorMessage(error));
      message.error(getApiErrorMessage(error));
    }
  };

  if (!project) {
    return (
      <div className="graph-editor">
        <div className="editor-loading">
          <Spin size="large" spinning={isLoading} />
        </div>
      </div>
    );
  }

  const isViewer = (project.myRole ?? 'owner') === 'viewer';

  const handleBack = () => {
    if (!hasEditedSinceLastSync) {
      navigate(GRAPH_EDITOR_BACK_PATH);
      return;
    }
    Modal.confirm({
      title: '有未保存的编辑',
      content: '返回后画布上的改动可能丢失，确定离开吗？',
      okText: '离开',
      cancelText: '留下',
      onOk: () => navigate(GRAPH_EDITOR_BACK_PATH),
    });
  };

  return (
    <div className="graph-editor">
      <div className="editor-top-bar">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={handleBack}
          className="back-btn"
        >
          返回
        </Button>
        <div className="project-info">
          <h2 className="project-info-name">{project.name}</h2>
          {isViewer && <span className="readonly-badge">只读模式</span>}
        </div>
        <div className="editor-actions">
          <SyncStatusIndicator onRetry={handleSave} />
          {!isViewer && (
            <Button
              type="primary"
              icon={<Save size={16} />}
              onClick={handleSave}
              loading={isSaving}
              className="save-btn"
            >
              保存
            </Button>
          )}
          <UserMenu />
        </div>
      </div>

      <Toolbar readOnly={isViewer} />

      <div className="editor-main">
        <LeftSidebar />
        <div ref={canvasContainerRef} className="canvas-container">
          <GraphCanvas width={canvasSize.width} height={canvasSize.height} />
        </div>
        <RightPanel readOnly={isViewer} />
      </div>
    </div>
  );
};

export default GraphEditor;
