import React, { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { useGraphStore } from '@/stores/useGraphStore';
import { generateId } from '@/utils/idGenerator';
import { canDragNodeInMode } from './graphInteractions';
import {
  calculateCircleEdgePoints,
  formatEdgeLabel,
  getNodeVisualMetrics,
} from './graphVisualModel';
import './index.css';

interface GraphCanvasProps {
  width: number;
  height: number;
}

type D3Node = d3.SimulationNodeDatum & {
  id: string;
  label: string;
  x: number;
  y: number;
  uri?: string | null;
  rdfType?: string | null;
  properties?: Record<string, unknown> | null;
  fx?: number | null;
  fy?: number | null;
};

type D3Edge = d3.SimulationLinkDatum<D3Node> & {
  id: string;
  label: string;
  predicate?: string | null;
  properties?: Record<string, unknown> | null;
  source: string | D3Node;
  target: string | D3Node;
};

function getTruncatedText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function getVisibleProperties(
  properties: Record<string, unknown> | null | undefined,
  maxItems = 3
): [string, unknown][] {
  return Object.entries(properties || {}).slice(0, maxItems);
}

function getEdgeRenderPoints(edge: D3Edge) {
  const source = edge.source as D3Node;
  const target = edge.target as D3Node;
  const sourceMetrics = getNodeVisualMetrics();
  const targetMetrics = getNodeVisualMetrics();

  return calculateCircleEdgePoints(
    {
      x: source.x ?? 0,
      y: source.y ?? 0,
      radius: sourceMetrics.radius,
    },
    {
      x: target.x ?? 0,
      y: target.y ?? 0,
      radius: targetMetrics.radius,
    }
  );
}

function getEdgeLabelWidth(edge: D3Edge): number {
  const label = formatEdgeLabel(edge);
  return Math.min(220, Math.max(48, label.length * 7 + 18));
}

const GraphCanvas: React.FC<GraphCanvasProps> = ({ width, height }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);

  const {
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    toolMode,
    connectingSourceId,
    addNode,
    updateNode,
  } = useGraphStore();

  const stateRef = useRef({
    selectedNodeId,
    selectedEdgeId,
    toolMode,
    connectingSourceId,
    nodes,
    edges,
  });

  useEffect(() => {
    stateRef.current = {
      selectedNodeId,
      selectedEdgeId,
      toolMode,
      connectingSourceId,
      nodes,
      edges,
    };
  }, [
    selectedNodeId,
    selectedEdgeId,
    toolMode,
    connectingSourceId,
    nodes,
    edges,
  ]);

  const handleSvgClick = useCallback(
    (event: MouseEvent) => {
      const state = useGraphStore.getState();
      if (state.toolMode !== 'addNode') return;

      const svg = svgRef.current;
      if (!svg) return;

      // Check if click target is a node (don't add if clicking node)
      const target = event.target as Element;
      if (
        target.closest('.node-group') ||
        target.closest('.edge-group')
      )
        return;

      const pt = svg.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

      // Get current transform to calculate actual position
      const g = d3.select(svg).select('g').node() as SVGGElement | null;
      let x = svgP.x;
      let y = svgP.y;
      if (g) {
        const transform = d3.zoomTransform(svg);
        x = (x - transform.x) / transform.k;
        y = (y - transform.y) / transform.k;
      }

      const newNode = {
        id: generateId(),
        label: `节点 ${state.nodes.length + 1}`,
        x,
        y,
      };
      addNode(newNode);
    },
    [addNode]
  );

  useEffect(() => {
    if (!svgRef.current || width === 0 || height === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    [
      { id: 'graph-edge-arrow', className: 'edge-arrow-head-default' },
      { id: 'graph-edge-arrow-hover', className: 'edge-arrow-head-hover' },
      {
        id: 'graph-edge-arrow-selected',
        className: 'edge-arrow-head-selected',
      },
    ].forEach((marker) => {
      defs
        .append('marker')
        .attr('id', marker.id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 10)
        .attr('refY', 0)
        .attr('markerWidth', 8)
        .attr('markerHeight', 8)
        .attr('orient', 'auto')
        .attr('markerUnits', 'strokeWidth')
        .append('path')
        .attr('class', marker.className)
        .attr('d', 'M 0 -5 L 10 0 L 0 5 Z');
    });

    const g = svg.append('g');

    // Zoom
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        zoomTransformRef.current = event.transform;
        g.attr('transform', event.transform.toString());
      });

    svg.call(zoom);
    svg.call(zoom.transform, zoomTransformRef.current);

    // Prepare data
    const simNodes: D3Node[] = nodes.map((n) => ({
      ...n,
      x: n.x ?? width / 2 + (Math.random() - 0.5) * 80,
      y: n.y ?? height / 2 + (Math.random() - 0.5) * 80,
    }));

    const simEdges: D3Edge[] = edges.map((e) => ({
      ...e,
      source: e.source,
      target: e.target,
    }));

    // Simulation
    const simulation = d3
      .forceSimulation<D3Node>(simNodes)
      .force(
        'link',
        d3
          .forceLink<D3Node, D3Edge>(simEdges)
          .id((d) => d.id)
          .distance(210)
      )
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force(
        'collision',
        d3.forceCollide<D3Node>().radius(() => {
          const metrics = getNodeVisualMetrics();
          return metrics.radius + 18;
        })
      );

    // Edges
    const edgeGroup = g.append('g').attr('class', 'edges');
    const edgeEnter = edgeGroup
      .selectAll<SVGGElement, D3Edge>('g.edge-group')
      .data(simEdges, (d) => (d as D3Edge).id)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'edge-group');
        g.append('line')
          .attr('class', 'edge-line')
          .attr('stroke', '#b0a394')
          .attr('stroke-width', 1.5)
          .attr('stroke-opacity', 0.7)
          .attr('marker-end', 'url(#graph-edge-arrow)');
        g.append('rect')
          .attr('class', 'edge-label-bg')
          .attr('rx', 3)
          .attr('ry', 3);
        g.append('text')
          .attr('class', 'edge-label')
          .attr('font-size', '10px')
          .attr('font-family', '"JetBrains Mono", monospace')
          .attr('fill', '#8a7d6b')
          .attr('text-anchor', 'middle')
          .attr('dy', '3');
        return g;
      });

    edgeEnter.select('text').text((d) => formatEdgeLabel(d));

    // Edge click handler
    edgeEnter.on('click', (event, d) => {
      event.stopPropagation();
      const state = useGraphStore.getState();
      if (state.toolMode === 'delete') {
        state.removeEdge(d.id);
      } else if (state.toolMode === 'select') {
        state.selectEdge(d.id);
      }
    });

    // Connecting line (for addEdge mode)
    const connectingLine = g
      .append('line')
      .attr('class', 'connecting-line')
      .attr('display', 'none');

    // Nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const nodeEnter = nodeGroup
      .selectAll<SVGGElement, D3Node>('g.node-group')
      .data(simNodes, (d) => (d as D3Node).id)
      .join((enter) => {
        const g = enter
          .append('g')
          .attr('class', () => {
            const metrics = getNodeVisualMetrics();
            return `node-group ${metrics.shape}`;
          });

        g.each(function renderNode(d) {
          const current = d3.select<SVGGElement, D3Node>(this);
          const metrics = getNodeVisualMetrics();

          current
            .append('circle')
            .attr('class', `node-shape ${metrics.shape}`)
            .attr('r', metrics.radius);

          current
            .append('text')
            .attr('class', 'node-label node-title')
            .attr('text-anchor', 'middle')
            .attr('y', -8)
            .text(getTruncatedText(d.label, 8));

          getVisibleProperties(d.properties, 2).forEach(([key, value], index) => {
            current
              .append('text')
              .attr('class', 'property-line')
              .attr('text-anchor', 'middle')
              .attr('x', 0)
              .attr('y', 11 + index * 13)
              .text(getTruncatedText(`${key}=${String(value)}`, 12));
          });

          if (d.rdfType) {
            current
              .append('text')
              .attr('class', 'type-label')
              .attr('text-anchor', 'middle')
              .attr('y', 26)
              .text(getTruncatedText(d.rdfType, 13));
          }
        });
        return g;
      });

    // Update selection state
    function updateSelection() {
      const state = stateRef.current;
      nodeEnter.classed('selected', (d) => d.id === state.selectedNodeId);
      edgeEnter.classed('selected', (d) => d.id === state.selectedEdgeId);
    }

    // Node drag
    const dragBehavior = d3
      .drag<SVGGElement, D3Node>()
      .filter((event) => {
        const state = useGraphStore.getState();
        return canDragNodeInMode(state.toolMode) && !event.ctrlKey && !event.button;
      })
      .clickDistance(6)
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
        updateNode(d.id, { x: d.x ?? 0, y: d.y ?? 0 });
      });

    nodeEnter.call(dragBehavior);

    // Node click handler
    nodeEnter.on('click', (event, d) => {
      event.stopPropagation();
      const state = useGraphStore.getState();

      if (state.toolMode === 'delete') {
        state.removeNode(d.id);
      } else if (state.toolMode === 'addEdge') {
        state.chooseEdgeEndpoint(d.id, generateId());
      } else if (state.toolMode === 'select') {
        state.selectNode(d.id);
      }
      updateSelection();
    });

    // Background click handler
    svg.on('click', (event) => {
      const state = useGraphStore.getState();
      const target = event.target as Element;
      if (
        target.tagName === 'svg' ||
        target.closest('.graph-canvas')
      ) {
        if (state.toolMode === 'select') {
          state.clearSelection();
          updateSelection();
        }
      }
    });

    // Tick
    simulation.on('tick', () => {
      edgeEnter
        .select('line')
        .attr('x1', (d) => getEdgeRenderPoints(d).x1)
        .attr('y1', (d) => getEdgeRenderPoints(d).y1)
        .attr('x2', (d) => getEdgeRenderPoints(d).x2)
        .attr('y2', (d) => getEdgeRenderPoints(d).y2);

      edgeEnter.select('text').attr('x', (d) => {
        const sx = (d.source as D3Node).x ?? 0;
        const tx = (d.target as D3Node).x ?? 0;
        return (sx + tx) / 2;
      });

      edgeEnter.select('text').attr('y', (d) => {
        const sy = (d.source as D3Node).y ?? 0;
        const ty = (d.target as D3Node).y ?? 0;
        return (sy + ty) / 2;
      });

      edgeEnter.select('rect').attr('x', (d) => {
        const sx = (d.source as D3Node).x ?? 0;
        const tx = (d.target as D3Node).x ?? 0;
        return (sx + tx) / 2 - getEdgeLabelWidth(d) / 2;
      });

      edgeEnter.select('rect').attr('y', (d) => {
        const sy = (d.source as D3Node).y ?? 0;
        const ty = (d.target as D3Node).y ?? 0;
        return (sy + ty) / 2 - 8;
      });

      edgeEnter
        .select('rect')
        .attr('width', (d) => getEdgeLabelWidth(d))
        .attr('height', 16);

      nodeEnter.attr(
        'transform',
        (d) => `translate(${d.x ?? 0},${d.y ?? 0})`
      );

      // Update connecting line
      const connState = stateRef.current;
      if (connState.connectingSourceId) {
        const sourceNode = simNodes.find(
          (n) => n.id === connState.connectingSourceId
        );
        if (sourceNode) {
          connectingLine
            .attr('display', 'block')
            .attr('x1', sourceNode.x ?? 0)
            .attr('y1', sourceNode.y ?? 0)
            .attr('x2', sourceNode.x ?? 0)
            .attr('y2', sourceNode.y ?? 0);
        }
      } else {
        connectingLine.attr('display', 'none');
      }
    });

    // Mouse move for connecting line
    svg.on('mousemove', (event) => {
      const state = stateRef.current;
      if (!state.connectingSourceId) return;
      const sourceNode = simNodes.find(
        (n) => n.id === state.connectingSourceId
      );
      if (!sourceNode) return;

      const pt = svgRef.current!.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const svgP = pt.matrixTransform(
        svgRef.current!.getScreenCTM()?.inverse()
      );

      const g = d3.select(svgRef.current!).select('g').node() as SVGGElement | null;
      let mx = svgP.x;
      let my = svgP.y;
      if (g) {
        const transform = d3.zoomTransform(svgRef.current!);
        mx = (mx - transform.x) / transform.k;
        my = (my - transform.y) / transform.k;
      }

      connectingLine
        .attr('x1', sourceNode.x ?? 0)
        .attr('y1', sourceNode.y ?? 0)
        .attr('x2', mx)
        .attr('y2', my);
    });

    // Initial selection update
    updateSelection();

    return () => {
      simulation.stop();
      svg.selectAll('*').remove();
    };
  }, [
    width,
    height,
    nodes.length,
    edges.length,
    nodes,
    edges,
    addNode,
    updateNode,
  ]);

  // Update selection classes when selectedNodeId/selectedEdgeId changes
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg
      .selectAll<SVGGElement, D3Node>('.node-group')
      .classed('selected', (d) => d.id === selectedNodeId);
    svg
      .selectAll<SVGGElement, D3Edge>('.edge-group')
      .classed('selected', (d) => d.id === selectedEdgeId);
  }, [selectedNodeId, selectedEdgeId]);

  const cursorClass =
    toolMode === 'addNode'
      ? 'mode-add-node'
      : toolMode === 'addEdge'
        ? 'mode-add-edge'
        : toolMode === 'delete'
          ? 'mode-delete'
          : '';

  return (
    <div ref={containerRef} className="graph-canvas paper-texture">
      <svg
        ref={svgRef}
        className={cursorClass}
        width={width}
        height={height}
        onClick={(e) => handleSvgClick(e.nativeEvent)}
      />
      {connectingSourceId && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#fdfbf7',
            border: '1px solid #d4652a',
            borderRadius: 6,
            padding: '6px 14px',
            fontSize: 13,
            color: '#d4652a',
            fontFamily: '"Source Sans 3", sans-serif',
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(44,36,27,0.1)',
          }}
        >
          请选择目标节点以创建连接...
        </div>
      )}
    </div>
  );
};

export default GraphCanvas;
