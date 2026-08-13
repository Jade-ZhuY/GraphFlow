import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { GraphNode, GraphEdge } from '@/types/graph';

interface SimulationNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  x: number;
  y: number;
}

interface SimulationLink extends d3.SimulationLinkDatum<SimulationNode> {
  id: string;
  label: string;
  source: string | SimulationNode;
  target: string | SimulationNode;
}

export function useForceSimulation(
  svgRef: React.RefObject<SVGSVGElement | null>,
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  onNodeDragEnd?: (id: string, x: number, y: number) => void
) {
  const simulationRef = useRef<d3.Simulation<SimulationNode, SimulationLink> | null>(
    null
  );
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(
    null
  );

  useEffect(() => {
    if (!svgRef.current || width === 0 || height === 0) return;

    const svg = d3.select(svgRef.current);

    // Clear previous content
    svg.selectAll('*').remove();

    // Create main group for zoom
    const g = svg.append('g');
    gRef.current = g;

    // Setup zoom
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
      });

    svg.call(zoom);

    // Prepare data
    const simulationNodes: SimulationNode[] = nodes.map((n) => ({
      ...n,
      x: n.x ?? width / 2 + (Math.random() - 0.5) * 100,
      y: n.y ?? height / 2 + (Math.random() - 0.5) * 100,
    }));

    const simulationLinks: SimulationLink[] = edges.map((e) => ({
      ...e,
      source: e.source,
      target: e.target,
    }));

    // Create simulation
    const simulation = d3
      .forceSimulation<SimulationNode>(simulationNodes)
      .force(
        'link',
        d3
          .forceLink<SimulationNode, SimulationLink>(simulationLinks)
          .id((d) => d.id)
          .distance(120)
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(35));

    simulationRef.current = simulation;

    // Render edges
    const linkGroup = g.append('g').attr('class', 'links');
    const link = linkGroup
      .selectAll('line')
      .data(simulationLinks)
      .join('line')
      .attr('stroke', '#a89b8c')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.7);

    // Render edge labels
    const edgeLabelGroup = g.append('g').attr('class', 'edge-labels');
    const edgeLabels = edgeLabelGroup
      .selectAll('text')
      .data(simulationLinks)
      .join('text')
      .attr('font-size', '10px')
      .attr('font-family', '"JetBrains Mono", monospace')
      .attr('fill', '#8a7d6b')
      .attr('text-anchor', 'middle')
      .attr('dy', '-4')
      .text((d) => d.label);

    // Render nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const dragBehavior = d3
      .drag<SVGGElement, SimulationNode>()
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
        onNodeDragEnd?.(d.id, d.x ?? 0, d.y ?? 0);
      });

    const node = nodeGroup
      .selectAll<SVGGElement, SimulationNode>('g')
      .data(simulationNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(dragBehavior);

    // Node circles
    node
      .append('circle')
      .attr('r', 18)
      .attr('fill', '#fdfbf7')
      .attr('stroke', '#d4652a')
      .attr('stroke-width', 2)
      .attr('class', 'node-circle');

    // Node labels
    node
      .append('text')
      .attr('dy', '4')
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-family', '"Source Sans 3", sans-serif')
      .attr('font-weight', '600')
      .attr('fill', '#2c241b')
      .text((d) => {
        return d.label.length > 6 ? d.label.slice(0, 6) + '...' : d.label;
      });

    // Tick function
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as SimulationNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimulationNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimulationNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimulationNode).y ?? 0);

      edgeLabels
        .attr('x', (d) => {
          const sx = (d.source as SimulationNode).x ?? 0;
          const tx = (d.target as SimulationNode).x ?? 0;
          return (sx + tx) / 2;
        })
        .attr('y', (d) => {
          const sy = (d.source as SimulationNode).y ?? 0;
          const ty = (d.target as SimulationNode).y ?? 0;
          return (sy + ty) / 2;
        });

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
      svg.selectAll('*').remove();
    };
  }, [svgRef, nodes, edges, width, height, onNodeDragEnd]);

  return { gRef, simulationRef };
}
