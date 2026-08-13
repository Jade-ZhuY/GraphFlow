import { apiClient, apiRequest } from '@/services/http';
import type {
  AddMemberRequest,
  CreateGraphEdgeRequest,
  CreateGraphNodeRequest,
  CreateProjectRequest,
  DeleteProjectResult,
  GraphProject,
  Member,
  SaveGraphRequest,
  UpdateGraphEdgeRequest,
  UpdateGraphNodeRequest,
  UpdateMemberRoleRequest,
} from '@/types/graph';

export function listProjects(): Promise<GraphProject[]> {
  return apiRequest<GraphProject[]>({
    method: 'GET',
    url: '/api/projects',
  });
}

export function createProject(
  payload: CreateProjectRequest
): Promise<GraphProject> {
  return apiRequest<GraphProject>({
    method: 'POST',
    url: '/api/projects',
    data: payload,
  });
}

export function getProject(projectId: string): Promise<GraphProject> {
  return apiRequest<GraphProject>({
    method: 'GET',
    url: `/api/projects/${projectId}`,
  });
}

export function getProjectGraph(projectId: string): Promise<GraphProject> {
  return apiRequest<GraphProject>({
    method: 'GET',
    url: `/api/projects/${projectId}/graph`,
  });
}

export function saveProjectGraph(
  projectId: string,
  payload: SaveGraphRequest
): Promise<GraphProject> {
  return apiRequest<GraphProject>({
    method: 'PUT',
    url: `/api/projects/${projectId}/graph`,
    data: payload,
  });
}

export function createProjectNode(
  projectId: string,
  payload: CreateGraphNodeRequest
): Promise<GraphProject> {
  return apiRequest<GraphProject>({
    method: 'POST',
    url: `/api/projects/${projectId}/nodes`,
    data: payload,
  });
}

export function updateProjectNode(
  projectId: string,
  nodeId: string,
  payload: UpdateGraphNodeRequest
): Promise<GraphProject> {
  return apiRequest<GraphProject>({
    method: 'PATCH',
    url: `/api/projects/${projectId}/nodes/${nodeId}`,
    data: payload,
  });
}

export function deleteProjectNode(
  projectId: string,
  nodeId: string
): Promise<GraphProject> {
  return apiRequest<GraphProject>({
    method: 'DELETE',
    url: `/api/projects/${projectId}/nodes/${nodeId}`,
  });
}

export function createProjectEdge(
  projectId: string,
  payload: CreateGraphEdgeRequest
): Promise<GraphProject> {
  return apiRequest<GraphProject>({
    method: 'POST',
    url: `/api/projects/${projectId}/edges`,
    data: payload,
  });
}

export function updateProjectEdge(
  projectId: string,
  edgeId: string,
  payload: UpdateGraphEdgeRequest
): Promise<GraphProject> {
  return apiRequest<GraphProject>({
    method: 'PATCH',
    url: `/api/projects/${projectId}/edges/${edgeId}`,
    data: payload,
  });
}

export function deleteProjectEdge(
  projectId: string,
  edgeId: string
): Promise<GraphProject> {
  return apiRequest<GraphProject>({
    method: 'DELETE',
    url: `/api/projects/${projectId}/edges/${edgeId}`,
  });
}

export function deleteProject(projectId: string): Promise<DeleteProjectResult> {
  return apiRequest<DeleteProjectResult>({
    method: 'DELETE',
    url: `/api/projects/${projectId}`,
  });
}

// ---- 成员管理 ----

export function listMembers(projectId: string): Promise<Member[]> {
  return apiRequest<Member[]>({
    method: 'GET',
    url: `/api/projects/${projectId}/members`,
  });
}

export function addMember(
  projectId: string,
  payload: AddMemberRequest
): Promise<Member> {
  return apiRequest<Member>({
    method: 'POST',
    url: `/api/projects/${projectId}/members`,
    data: payload,
  });
}

export function updateMemberRole(
  projectId: string,
  userId: string,
  payload: UpdateMemberRoleRequest
): Promise<Member> {
  return apiRequest<Member>({
    method: 'PATCH',
    url: `/api/projects/${projectId}/members/${userId}`,
    data: payload,
  });
}

export function removeMember(
  projectId: string,
  userId: string
): Promise<{ removed: boolean }> {
  return apiRequest<{ removed: boolean }>({
    method: 'DELETE',
    url: `/api/projects/${projectId}/members/${userId}`,
  });
}

// ---- 导入导出 ----

/**
 * 导出项目为标准格式文件。返回 Blob（裸文件流，绕过统一响应包封装）。
 * format：turtle / jsonld 导出为 RDF 格式；json 导出为属性图格式。
 */
export async function exportProject(
  projectId: string,
  format: 'turtle' | 'jsonld' | 'json'
): Promise<Blob> {
  const response = await apiClient.get(
    `/api/projects/${projectId}/export`,
    {
      params: { fmt: format },
      responseType: 'blob',
    }
  );
  return response.data as Blob;
}

/**
 * 导入标准格式文件，创建新项目。返回新建项目。
 * format：turtle / jsonld 按 RDF 解析；json 按属性图解析。
 */
export function importProject(
  file: File,
  format: 'turtle' | 'jsonld' | 'json'
): Promise<GraphProject> {
  const form = new FormData();
  form.append('file', file);
  form.append('fmt', format);
  return apiRequest<GraphProject>({
    method: 'POST',
    url: '/api/projects/import',
    data: form,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
