import { create } from 'zustand';
import type {
  GraphEdge,
  GraphNode,
  GraphSnapshot,
  ToolMode,
} from '@/types/graph';
import { useEditorSyncStore } from '@/stores/useEditorSyncStore';

interface GraphState {
  // Data
  nodes: GraphNode[];
  edges: GraphEdge[];

  // Selection
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  // Tool mode
  toolMode: ToolMode;

  // History for undo/redo
  history: GraphSnapshot[];
  historyIndex: number;

  // Edge connection temp state
  connectingSourceId: string | null;

  // Actions
  setGraphData: (nodes: GraphNode[], edges: GraphEdge[]) => void;
  addNode: (node: GraphNode) => void;
  removeNode: (id: string) => void;
  updateNode: (id: string, updates: Partial<GraphNode>) => void;
  addEdge: (edge: GraphEdge) => void;
  removeEdge: (id: string) => void;
  updateEdge: (id: string, updates: Partial<GraphEdge>) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  setToolMode: (mode: ToolMode) => void;
  setConnectingSourceId: (id: string | null) => void;
  startEdgeConnection: (sourceId: string) => void;
  chooseEdgeEndpoint: (nodeId: string, edgeId: string) => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  clearSelection: () => void;
}

function cloneSnapshot(nodes: GraphNode[], edges: GraphEdge[]): GraphSnapshot {
  return {
    nodes: nodes.map((n) => ({ ...n })),
    edges: edges.map((e) => ({ ...e })),
  };
}

function normalizeRequiredLabelUpdate<T extends { label?: string | null }>(
  updates: T
): T | null {
  if (typeof updates.label !== 'string') return updates;

  const label = updates.label.trim();
  if (!label) return null;

  return { ...updates, label } as T;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  toolMode: 'select',
  history: [],
  historyIndex: -1,
  connectingSourceId: null,

  setGraphData: (nodes, edges) => {
    const snapshot = cloneSnapshot(nodes, edges);
    set({
      nodes,
      edges,
      history: [snapshot],
      historyIndex: 0,
      selectedNodeId: null,
      selectedEdgeId: null,
      toolMode: 'select',
      connectingSourceId: null,
    });
  },

  pushHistory: () => {
    const { nodes, edges, history, historyIndex } = get();
    const snapshot = cloneSnapshot(nodes, edges);
    // Truncate redo history if we are in the middle
    const newHistory = history.slice(0, historyIndex + 1);
    // Limit history size
    if (newHistory.length >= 50) {
      newHistory.shift();
    }
    newHistory.push(snapshot);
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  addNode: (node) => {
    set((state) => ({ nodes: [...state.nodes, node] }));
    get().pushHistory();
    useEditorSyncStore.getState().markEdited();
  },

  removeNode: (id) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId:
        state.selectedNodeId === id ? null : state.selectedNodeId,
    }));
    get().pushHistory();
    useEditorSyncStore.getState().markEdited();
  },

  updateNode: (id, updates) => {
    const normalizedUpdates = normalizeRequiredLabelUpdate(updates);
    if (!normalizedUpdates) return;
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, ...normalizedUpdates } : n
      ),
    }));
    useEditorSyncStore.getState().markEdited();
  },

  addEdge: (edge) => {
    set((state) => ({ edges: [...state.edges, edge] }));
    get().pushHistory();
    useEditorSyncStore.getState().markEdited();
  },

  removeEdge: (id) => {
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== id),
      selectedEdgeId:
        state.selectedEdgeId === id ? null : state.selectedEdgeId,
    }));
    get().pushHistory();
    useEditorSyncStore.getState().markEdited();
  },

  updateEdge: (id, updates) => {
    const normalizedUpdates = normalizeRequiredLabelUpdate(updates);
    if (!normalizedUpdates) return;
    set((state) => ({
      edges: state.edges.map((e) =>
        e.id === id ? { ...e, ...normalizedUpdates } : e
      ),
    }));
    useEditorSyncStore.getState().markEdited();
  },

  selectNode: (id) =>
    set({ selectedNodeId: id, selectedEdgeId: null, connectingSourceId: null }),

  selectEdge: (id) =>
    set({ selectedEdgeId: id, selectedNodeId: null, connectingSourceId: null }),

  setToolMode: (mode) =>
    set({
      toolMode: mode,
      selectedNodeId: null,
      selectedEdgeId: null,
      connectingSourceId: null,
    }),

  setConnectingSourceId: (id) => set({ connectingSourceId: id }),

  startEdgeConnection: (sourceId) =>
    set({
      selectedNodeId: sourceId,
      selectedEdgeId: null,
      connectingSourceId: sourceId,
    }),

  chooseEdgeEndpoint: (nodeId, edgeId) => {
    const sourceId = get().connectingSourceId;
    if (!sourceId) {
      get().startEdgeConnection(nodeId);
      return;
    }

    if (sourceId === nodeId) {
      get().clearSelection();
      return;
    }

    get().addEdge({
      id: edgeId,
      source: sourceId,
      target: nodeId,
      label: '关系',
    });
    get().clearSelection();
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const snapshot = history[newIndex];
    const nodes = snapshot.nodes.map((n) => ({ ...n }));
    const edges = snapshot.edges.map((e) => ({ ...e }));
    set({
      nodes,
      edges,
      historyIndex: newIndex,
      selectedNodeId: null,
      selectedEdgeId: null,
      connectingSourceId: null,
    });
    useEditorSyncStore.getState().markEdited();
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const snapshot = history[newIndex];
    const nodes = snapshot.nodes.map((n) => ({ ...n }));
    const edges = snapshot.edges.map((e) => ({ ...e }));
    set({
      nodes,
      edges,
      historyIndex: newIndex,
      selectedNodeId: null,
      selectedEdgeId: null,
      connectingSourceId: null,
    });
    useEditorSyncStore.getState().markEdited();
  },

  clearSelection: () =>
    set({
      selectedNodeId: null,
      selectedEdgeId: null,
      connectingSourceId: null,
    }),
}));
