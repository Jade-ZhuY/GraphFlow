export type ProjectRole = 'owner' | 'editor' | 'viewer';
export type MemberRole = 'editor' | 'viewer';

export interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  /** 节点的 URI（可选） */
  uri?: string | null;
  /** 节点的类型（可选） */
  rdfType?: string | null;
  /** 动态属性（可选） */
  properties?: Record<string, unknown> | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  /** 谓词 URI（可选） */
  predicate?: string | null;
  /** 动态属性（可选） */
  properties?: Record<string, unknown> | null;
}

export interface GraphProject {
  id: string;
  name: string;
  description?: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  createdAt: string;
  updatedAt: string;
  /** 当前用户在该项目中的角色。owner=所有者，editor=可编辑，viewer=只读。 */
  myRole?: ProjectRole;
}

export interface Member {
  userId: string;
  email: string;
  username: string;
  displayName: string;
  role: ProjectRole;
  joinedAt: string;
}

export interface AddMemberRequest {
  email: string;
  role: MemberRole;
}

export interface UpdateMemberRoleRequest {
  role: MemberRole;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface SaveGraphRequest {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CreateGraphNodeRequest {
  id?: string;
  label: string;
  x: number;
  y: number;
  uri?: string | null;
  rdfType?: string | null;
  properties?: Record<string, unknown> | null;
}

export type UpdateGraphNodeRequest = Partial<
  Omit<CreateGraphNodeRequest, 'id'>
>;

export interface CreateGraphEdgeRequest {
  id?: string;
  source: string;
  target: string;
  label: string;
  predicate?: string | null;
  properties?: Record<string, unknown> | null;
}

export type UpdateGraphEdgeRequest = Partial<
  Omit<CreateGraphEdgeRequest, 'id'>
>;

export interface DeleteProjectResult {
  deleted: boolean;
  projectId: string;
}

export type ToolMode = 'select' | 'addNode' | 'addEdge' | 'delete';

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
