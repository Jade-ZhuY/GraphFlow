import { create } from 'zustand';
import * as projectApi from '@/services/projectApi';
import { getApiErrorMessage } from '@/services/http';
import type {
  CreateGraphEdgeRequest,
  CreateGraphNodeRequest,
  CreateProjectRequest,
  GraphProject,
  SaveGraphRequest,
  UpdateGraphEdgeRequest,
  UpdateGraphNodeRequest,
} from '@/types/graph';

interface ProjectState {
  projects: GraphProject[];
  currentProjectId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  fetchProjects: () => Promise<GraphProject[]>;
  createProject: (payload: CreateProjectRequest) => Promise<GraphProject>;
  deleteProject: (id: string) => Promise<void>;
  fetchProject: (id: string) => Promise<GraphProject>;
  fetchGraph: (id: string) => Promise<GraphProject>;
  saveGraph: (id: string, payload: SaveGraphRequest) => Promise<GraphProject>;
  createNode: (
    projectId: string,
    payload: CreateGraphNodeRequest
  ) => Promise<GraphProject>;
  updateNode: (
    projectId: string,
    nodeId: string,
    payload: UpdateGraphNodeRequest
  ) => Promise<GraphProject>;
  deleteNode: (projectId: string, nodeId: string) => Promise<GraphProject>;
  createEdge: (
    projectId: string,
    payload: CreateGraphEdgeRequest
  ) => Promise<GraphProject>;
  updateEdge: (
    projectId: string,
    edgeId: string,
    payload: UpdateGraphEdgeRequest
  ) => Promise<GraphProject>;
  deleteEdge: (projectId: string, edgeId: string) => Promise<GraphProject>;
  setCurrentProject: (id: string | null) => void;
  clearProjects: () => void;
  getProjectById: (id: string) => GraphProject | undefined;
}

function upsertProject(
  projects: GraphProject[],
  project: GraphProject
): GraphProject[] {
  const exists = projects.some((item) => item.id === project.id);
  if (!exists) {
    return [project, ...projects];
  }
  return projects.map((item) => (item.id === project.id ? project : item));
}

function toErrorMessage(error: unknown): string {
  return getApiErrorMessage(error);
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  currentProjectId: null,
  isLoading: false,
  isSaving: false,
  error: null,

  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const projects = await projectApi.listProjects();
      set({ projects, isLoading: false, error: null });
      return projects;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  createProject: async (payload) => {
    set({ isSaving: true, error: null });
    try {
      const project = await projectApi.createProject(payload);
      set((state) => ({
        projects: upsertProject(state.projects, project),
        currentProjectId: project.id,
        isSaving: false,
        error: null,
      }));
      return project;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ isSaving: false, error: message });
      throw error;
    }
  },

  deleteProject: async (id) => {
    set({ isSaving: true, error: null });
    try {
      await projectApi.deleteProject(id);
      set((state) => ({
        projects: state.projects.filter((project) => project.id !== id),
        currentProjectId:
          state.currentProjectId === id ? null : state.currentProjectId,
        isSaving: false,
        error: null,
      }));
    } catch (error) {
      const message = toErrorMessage(error);
      set({ isSaving: false, error: message });
      throw error;
    }
  },

  fetchProject: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const project = await projectApi.getProject(id);
      set((state) => ({
        projects: upsertProject(state.projects, project),
        currentProjectId: project.id,
        isLoading: false,
        error: null,
      }));
      return project;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  fetchGraph: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const project = await projectApi.getProjectGraph(id);
      set((state) => ({
        projects: upsertProject(state.projects, project),
        currentProjectId: project.id,
        isLoading: false,
        error: null,
      }));
      return project;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  saveGraph: async (id, payload) => {
    set({ isSaving: true, error: null });
    try {
      const project = await projectApi.saveProjectGraph(id, payload);
      set((state) => ({
        projects: upsertProject(state.projects, project),
        currentProjectId: project.id,
        isSaving: false,
        error: null,
      }));
      return project;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ isSaving: false, error: message });
      throw error;
    }
  },

  createNode: async (projectId, payload) => {
    set({ isSaving: true, error: null });
    try {
      const project = await projectApi.createProjectNode(projectId, payload);
      set((state) => ({
        projects: upsertProject(state.projects, project),
        currentProjectId: project.id,
        isSaving: false,
        error: null,
      }));
      return project;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ isSaving: false, error: message });
      throw error;
    }
  },

  updateNode: async (projectId, nodeId, payload) => {
    set({ isSaving: true, error: null });
    try {
      const project = await projectApi.updateProjectNode(projectId, nodeId, payload);
      set((state) => ({
        projects: upsertProject(state.projects, project),
        currentProjectId: project.id,
        isSaving: false,
        error: null,
      }));
      return project;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ isSaving: false, error: message });
      throw error;
    }
  },

  deleteNode: async (projectId, nodeId) => {
    set({ isSaving: true, error: null });
    try {
      const project = await projectApi.deleteProjectNode(projectId, nodeId);
      set((state) => ({
        projects: upsertProject(state.projects, project),
        currentProjectId: project.id,
        isSaving: false,
        error: null,
      }));
      return project;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ isSaving: false, error: message });
      throw error;
    }
  },

  createEdge: async (projectId, payload) => {
    set({ isSaving: true, error: null });
    try {
      const project = await projectApi.createProjectEdge(projectId, payload);
      set((state) => ({
        projects: upsertProject(state.projects, project),
        currentProjectId: project.id,
        isSaving: false,
        error: null,
      }));
      return project;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ isSaving: false, error: message });
      throw error;
    }
  },

  updateEdge: async (projectId, edgeId, payload) => {
    set({ isSaving: true, error: null });
    try {
      const project = await projectApi.updateProjectEdge(projectId, edgeId, payload);
      set((state) => ({
        projects: upsertProject(state.projects, project),
        currentProjectId: project.id,
        isSaving: false,
        error: null,
      }));
      return project;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ isSaving: false, error: message });
      throw error;
    }
  },

  deleteEdge: async (projectId, edgeId) => {
    set({ isSaving: true, error: null });
    try {
      const project = await projectApi.deleteProjectEdge(projectId, edgeId);
      set((state) => ({
        projects: upsertProject(state.projects, project),
        currentProjectId: project.id,
        isSaving: false,
        error: null,
      }));
      return project;
    } catch (error) {
      const message = toErrorMessage(error);
      set({ isSaving: false, error: message });
      throw error;
    }
  },

  setCurrentProject: (id) => set({ currentProjectId: id }),

  clearProjects: () =>
    set({
      projects: [],
      currentProjectId: null,
      isLoading: false,
      isSaving: false,
      error: null,
    }),

  getProjectById: (id) => get().projects.find((project) => project.id === id),
}));
