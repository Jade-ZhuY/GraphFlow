import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as projectApi from '@/services/projectApi';
import { useProjectStore } from '@/stores/useProjectStore';
import type { GraphProject } from '@/types/graph';

vi.mock('@/services/projectApi', () => ({
  createProjectEdge: vi.fn(),
  createProjectNode: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  deleteProjectEdge: vi.fn(),
  deleteProjectNode: vi.fn(),
  getProjectGraph: vi.fn(),
  getProject: vi.fn(),
  listProjects: vi.fn(),
  saveProjectGraph: vi.fn(),
  updateProjectEdge: vi.fn(),
  updateProjectNode: vi.fn(),
}));

const sampleProject: GraphProject = {
  id: 'p_1',
  name: '客户知识图谱',
  description: '销售线索',
  nodes: [],
  edges: [],
  createdAt: '2026-06-18T00:00:00.000Z',
  updatedAt: '2026-06-18T00:00:00.000Z',
};

describe('useProjectStore', () => {
  beforeEach(() => {
    vi.mocked(projectApi.createProject).mockReset();
    vi.mocked(projectApi.createProjectEdge).mockReset();
    vi.mocked(projectApi.createProjectNode).mockReset();
    vi.mocked(projectApi.deleteProject).mockReset();
    vi.mocked(projectApi.deleteProjectEdge).mockReset();
    vi.mocked(projectApi.deleteProjectNode).mockReset();
    vi.mocked(projectApi.getProjectGraph).mockReset();
    vi.mocked(projectApi.getProject).mockReset();
    vi.mocked(projectApi.listProjects).mockReset();
    vi.mocked(projectApi.saveProjectGraph).mockReset();
    vi.mocked(projectApi.updateProjectEdge).mockReset();
    vi.mocked(projectApi.updateProjectNode).mockReset();
    useProjectStore.getState().clearProjects();
  });

  it('fetches projects from the backend and caches them', async () => {
    vi.mocked(projectApi.listProjects).mockResolvedValueOnce([sampleProject]);

    await useProjectStore.getState().fetchProjects();

    expect(projectApi.listProjects).toHaveBeenCalledOnce();
    expect(useProjectStore.getState().projects).toEqual([sampleProject]);
    expect(useProjectStore.getState().isLoading).toBe(false);
    expect(useProjectStore.getState().error).toBeNull();
  });

  it('creates a project through the backend and selects it', async () => {
    vi.mocked(projectApi.createProject).mockResolvedValueOnce(sampleProject);

    const created = await useProjectStore.getState().createProject({
      name: '客户知识图谱',
      description: '销售线索',
    });

    expect(created).toEqual(sampleProject);
    expect(useProjectStore.getState().projects).toEqual([sampleProject]);
    expect(useProjectStore.getState().currentProjectId).toBe('p_1');
  });

  it('saves graph data and replaces the cached project', async () => {
    const savedProject: GraphProject = {
      ...sampleProject,
      nodes: [{ id: 'n_1', label: '客户', x: 1, y: 2 }],
      updatedAt: '2026-06-18T00:01:00.000Z',
    };
    useProjectStore.setState({ projects: [sampleProject] });
    vi.mocked(projectApi.saveProjectGraph).mockResolvedValueOnce(savedProject);

    const saved = await useProjectStore.getState().saveGraph('p_1', {
      nodes: savedProject.nodes,
      edges: [],
    });

    expect(saved).toEqual(savedProject);
    expect(useProjectStore.getState().projects).toEqual([savedProject]);
    expect(useProjectStore.getState().isSaving).toBe(false);
  });

  it('fetches the backend-owned graph and replaces the cached project', async () => {
    const graphProject: GraphProject = {
      ...sampleProject,
      nodes: [{ id: 'n_1', label: '客户', x: 1, y: 2 }],
    };
    vi.mocked(projectApi.getProjectGraph).mockResolvedValueOnce(graphProject);

    const loaded = await useProjectStore.getState().fetchGraph('p_1');

    expect(loaded).toEqual(graphProject);
    expect(useProjectStore.getState().projects).toEqual([graphProject]);
  });

  it('creates, updates, and deletes graph nodes through backend-owned APIs', async () => {
    const withNode: GraphProject = {
      ...sampleProject,
      nodes: [{ id: 'n_1', label: '客户', x: 1, y: 2 }],
    };
    const updatedNodeProject: GraphProject = {
      ...sampleProject,
      nodes: [{ id: 'n_1', label: '重点客户', x: 1, y: 2 }],
    };
    vi.mocked(projectApi.createProjectNode).mockResolvedValueOnce(withNode);
    vi.mocked(projectApi.updateProjectNode).mockResolvedValueOnce(updatedNodeProject);
    vi.mocked(projectApi.deleteProjectNode).mockResolvedValueOnce(sampleProject);

    await useProjectStore.getState().createNode('p_1', {
      id: 'n_1',
      label: '客户',
      x: 1,
      y: 2,
    });
    await useProjectStore.getState().updateNode('p_1', 'n_1', {
      label: '重点客户',
    });
    await useProjectStore.getState().deleteNode('p_1', 'n_1');

    expect(projectApi.createProjectNode).toHaveBeenCalledWith('p_1', {
      id: 'n_1',
      label: '客户',
      x: 1,
      y: 2,
    });
    expect(projectApi.updateProjectNode).toHaveBeenCalledWith('p_1', 'n_1', {
      label: '重点客户',
    });
    expect(projectApi.deleteProjectNode).toHaveBeenCalledWith('p_1', 'n_1');
    expect(useProjectStore.getState().projects).toEqual([sampleProject]);
  });

  it('creates, updates, and deletes graph edges through backend-owned APIs', async () => {
    const withEdge: GraphProject = {
      ...sampleProject,
      edges: [{ id: 'e_1', source: 'n_1', target: 'n_2', label: '关系' }],
    };
    const updatedEdgeProject: GraphProject = {
      ...sampleProject,
      edges: [{ id: 'e_1', source: 'n_1', target: 'n_2', label: '强关系' }],
    };
    vi.mocked(projectApi.createProjectEdge).mockResolvedValueOnce(withEdge);
    vi.mocked(projectApi.updateProjectEdge).mockResolvedValueOnce(updatedEdgeProject);
    vi.mocked(projectApi.deleteProjectEdge).mockResolvedValueOnce(sampleProject);

    await useProjectStore.getState().createEdge('p_1', {
      id: 'e_1',
      source: 'n_1',
      target: 'n_2',
      label: '关系',
    });
    await useProjectStore.getState().updateEdge('p_1', 'e_1', {
      label: '强关系',
    });
    await useProjectStore.getState().deleteEdge('p_1', 'e_1');

    expect(projectApi.createProjectEdge).toHaveBeenCalledWith('p_1', {
      id: 'e_1',
      source: 'n_1',
      target: 'n_2',
      label: '关系',
    });
    expect(projectApi.updateProjectEdge).toHaveBeenCalledWith('p_1', 'e_1', {
      label: '强关系',
    });
    expect(projectApi.deleteProjectEdge).toHaveBeenCalledWith('p_1', 'e_1');
    expect(useProjectStore.getState().projects).toEqual([sampleProject]);
  });

  it('deletes a project through the backend and removes it from the cache', async () => {
    useProjectStore.setState({
      projects: [sampleProject],
      currentProjectId: 'p_1',
    });
    vi.mocked(projectApi.deleteProject).mockResolvedValueOnce({
      deleted: true,
      projectId: 'p_1',
    });

    await useProjectStore.getState().deleteProject('p_1');

    expect(projectApi.deleteProject).toHaveBeenCalledWith('p_1');
    expect(useProjectStore.getState().projects).toEqual([]);
    expect(useProjectStore.getState().currentProjectId).toBeNull();
  });
});
