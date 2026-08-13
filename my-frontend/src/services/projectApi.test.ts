import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/services/http';
import {
  createProjectEdge,
  createProjectNode,
  createProject,
  deleteProject,
  deleteProjectEdge,
  deleteProjectNode,
  getProjectGraph,
  getProject,
  listProjects,
  saveProjectGraph,
  updateProjectEdge,
  updateProjectNode,
} from '@/services/projectApi';

vi.mock('@/services/http', () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

describe('projectApi', () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
  });

  it('lists projects through the authenticated API client', async () => {
    mockedApiRequest.mockResolvedValueOnce([]);

    await listProjects();

    expect(mockedApiRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/api/projects',
    });
  });

  it('creates a project through the backend', async () => {
    const payload = {
      name: '客户知识图谱',
      description: '销售线索',
    };
    mockedApiRequest.mockResolvedValueOnce({
      id: 'p_1',
      ...payload,
      nodes: [],
      edges: [],
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    });

    await createProject(payload);

    expect(mockedApiRequest).toHaveBeenCalledWith({
      method: 'POST',
      url: '/api/projects',
      data: payload,
    });
  });

  it('gets a project by id', async () => {
    mockedApiRequest.mockResolvedValueOnce({
      id: 'p_1',
      name: '项目',
      nodes: [],
      edges: [],
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    });

    await getProject('p_1');

    expect(mockedApiRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/api/projects/p_1',
    });
  });

  it('gets a backend-owned project graph', async () => {
    mockedApiRequest.mockResolvedValueOnce({
      id: 'p_1',
      name: '项目',
      nodes: [],
      edges: [],
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    });

    await getProjectGraph('p_1');

    expect(mockedApiRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/api/projects/p_1/graph',
    });
  });

  it('creates, updates, and deletes graph nodes through backend-owned APIs', async () => {
    mockedApiRequest.mockResolvedValue({
      id: 'p_1',
      name: '项目',
      nodes: [],
      edges: [],
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    });

    await createProjectNode('p_1', { id: 'n_1', label: '客户', x: 1, y: 2 });
    await updateProjectNode('p_1', 'n_1', { label: '重点客户' });
    await deleteProjectNode('p_1', 'n_1');

    expect(mockedApiRequest).toHaveBeenNthCalledWith(1, {
      method: 'POST',
      url: '/api/projects/p_1/nodes',
      data: { id: 'n_1', label: '客户', x: 1, y: 2 },
    });
    expect(mockedApiRequest).toHaveBeenNthCalledWith(2, {
      method: 'PATCH',
      url: '/api/projects/p_1/nodes/n_1',
      data: { label: '重点客户' },
    });
    expect(mockedApiRequest).toHaveBeenNthCalledWith(3, {
      method: 'DELETE',
      url: '/api/projects/p_1/nodes/n_1',
    });
  });

  it('creates, updates, and deletes graph edges through backend-owned APIs', async () => {
    mockedApiRequest.mockResolvedValue({
      id: 'p_1',
      name: '项目',
      nodes: [],
      edges: [],
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    });

    await createProjectEdge('p_1', {
      id: 'e_1',
      source: 'n_1',
      target: 'n_2',
      label: '关系',
    });
    await updateProjectEdge('p_1', 'e_1', { label: '强关系' });
    await deleteProjectEdge('p_1', 'e_1');

    expect(mockedApiRequest).toHaveBeenNthCalledWith(1, {
      method: 'POST',
      url: '/api/projects/p_1/edges',
      data: {
        id: 'e_1',
        source: 'n_1',
        target: 'n_2',
        label: '关系',
      },
    });
    expect(mockedApiRequest).toHaveBeenNthCalledWith(2, {
      method: 'PATCH',
      url: '/api/projects/p_1/edges/e_1',
      data: { label: '强关系' },
    });
    expect(mockedApiRequest).toHaveBeenNthCalledWith(3, {
      method: 'DELETE',
      url: '/api/projects/p_1/edges/e_1',
    });
  });

  it('saves the full graph snapshot', async () => {
    const payload = {
      nodes: [{ id: 'n_1', label: '客户', x: 1, y: 2 }],
      edges: [],
    };
    mockedApiRequest.mockResolvedValueOnce({
      id: 'p_1',
      name: '项目',
      ...payload,
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    });

    await saveProjectGraph('p_1', payload);

    expect(mockedApiRequest).toHaveBeenCalledWith({
      method: 'PUT',
      url: '/api/projects/p_1/graph',
      data: payload,
    });
  });

  it('deletes a project by id', async () => {
    mockedApiRequest.mockResolvedValueOnce({
      deleted: true,
      projectId: 'p_1',
    });

    await deleteProject('p_1');

    expect(mockedApiRequest).toHaveBeenCalledWith({
      method: 'DELETE',
      url: '/api/projects/p_1',
    });
  });
});
