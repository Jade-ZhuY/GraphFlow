import { beforeEach, describe, expect, it } from 'vitest';
import { useGraphStore } from '@/stores/useGraphStore';

describe('useGraphStore edge connection state', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      toolMode: 'select',
      history: [],
      historyIndex: -1,
      connectingSourceId: null,
    });
  });

  it('keeps the source node when starting an edge connection', () => {
    useGraphStore.setState({
      selectedEdgeId: 'e_existing',
      connectingSourceId: null,
    });

    useGraphStore.getState().startEdgeConnection('n_source');

    expect(useGraphStore.getState().selectedNodeId).toBe('n_source');
    expect(useGraphStore.getState().selectedEdgeId).toBeNull();
    expect(useGraphStore.getState().connectingSourceId).toBe('n_source');
  });

  it('creates an edge after choosing a source and target in add-edge mode', () => {
    useGraphStore.setState({
      nodes: [
        { id: 'n_source', label: '节点 1', x: 0, y: 0 },
        { id: 'n_target', label: '节点 2', x: 100, y: 100 },
      ],
      edges: [],
      toolMode: 'addEdge',
      connectingSourceId: null,
    });

    useGraphStore.getState().chooseEdgeEndpoint('n_source', 'e_unused');

    expect(useGraphStore.getState().selectedNodeId).toBe('n_source');
    expect(useGraphStore.getState().connectingSourceId).toBe('n_source');
    expect(useGraphStore.getState().edges).toEqual([]);

    useGraphStore.getState().chooseEdgeEndpoint('n_target', 'e_created');

    expect(useGraphStore.getState().edges).toEqual([
      {
        id: 'e_created',
        source: 'n_source',
        target: 'n_target',
        label: '关系',
      },
    ]);
    expect(useGraphStore.getState().selectedNodeId).toBeNull();
    expect(useGraphStore.getState().connectingSourceId).toBeNull();
  });

  it('trims required labels before storing them', () => {
    useGraphStore.getState().setGraphData(
      [{ id: 'n_1', label: '节点 1', x: 1, y: 2 }],
      [{ id: 'e_1', source: 'n_1', target: 'n_1', label: '关系' }]
    );

    useGraphStore.getState().updateNode('n_1', { label: '  客户  ' });
    useGraphStore.getState().updateEdge('e_1', { label: '  下单  ' });

    expect(useGraphStore.getState().nodes[0].label).toBe('客户');
    expect(useGraphStore.getState().edges[0].label).toBe('下单');
  });

  it('ignores blank required labels for nodes and edges', () => {
    useGraphStore.getState().setGraphData(
      [{ id: 'n_1', label: '节点 1', x: 1, y: 2 }],
      [{ id: 'e_1', source: 'n_1', target: 'n_1', label: '关系' }]
    );

    useGraphStore.getState().updateNode('n_1', { label: '   ' });
    useGraphStore.getState().updateEdge('e_1', { label: '' });

    expect(useGraphStore.getState().nodes[0].label).toBe('节点 1');
    expect(useGraphStore.getState().edges[0].label).toBe('关系');
  });

  it('keeps undo and redo snapshots complete locally', () => {
    useGraphStore.getState().setGraphData([], []);

    useGraphStore.getState().addNode({ id: 'n_1', label: '节点', x: 1, y: 2 });
    expect(useGraphStore.getState().historyIndex).toBe(1);

    useGraphStore.getState().undo();
    expect(useGraphStore.getState().nodes).toEqual([]);

    useGraphStore.getState().redo();
    expect(useGraphStore.getState().nodes).toEqual([
      { id: 'n_1', label: '节点', x: 1, y: 2 },
    ]);
  });
});
