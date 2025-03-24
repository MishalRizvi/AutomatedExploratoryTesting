'use client'

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface GraphVisualizerProps {
  graph: any;
}

interface Node {
  id: string;
  name: string;
  type: any;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface Link {
  source: string | Node;
  target: string | Node;
  value: number;
}

export default function GraphVisualizer({ graph }: GraphVisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  
  useEffect(() => {
    if (!graph || !svgRef.current) return;
    
    // Clear any existing visualization
    d3.select(svgRef.current).selectAll('*').remove();
    
    // Extract nodes and links from the graph
    const nodes: Node[] = Object.keys(graph.nodes).map(key => ({
      id: key,
      name: key,
      type: graph.nodes[key].type
    }));
    
    const links: Link[] = graph.edges.map((edge: any) => ({
      source: edge.from,
      target: edge.to,
      value: 1
    }));
    
    // Set up the SVG container
    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    
    // Create a force simulation
    const simulation = d3.forceSimulation<Node>(nodes)
      .force('link', d3.forceLink<Node, Link>(links).id((d) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));
    
    // Create the links
    const link = svg.append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 2);
    
    // Create the nodes
    const node = svg.append('g')
      .selectAll<SVGGElement, Node>('g')
      .data(nodes)
      .enter()
      .append('g')
      .call(d3.drag<SVGGElement, Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended) as any);
    
    // Add circles to the nodes
    node.append('circle')
      .attr('r', 8)
      .attr('fill', (d) => {
        // Color nodes by type
        if (d.type === 'page') return '#4f46e5'; // Indigo
        if (d.type === 'button') return '#7c3aed'; // Purple
        if (d.type === 'link') return '#2563eb'; // Blue
        if (d.type === 'input') return '#db2777'; // Pink
        return '#9ca3af'; // Gray
      });
    
    // Add labels to the nodes
    node.append('text')
      .attr('dx', 12)
      .attr('dy', '.35em')
      .text((d) => d.name.length > 20 ? d.name.substring(0, 20) + '...' : d.name)
      .attr('font-size', '10px')
      .attr('fill', '#4b5563');
    
    // Update positions on each tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => (d.source as Node).x || 0)
        .attr('y1', (d: any) => (d.source as Node).y || 0)
        .attr('x2', (d: any) => (d.target as Node).x || 0)
        .attr('y2', (d: any) => (d.target as Node).y || 0);
      
      node
        .attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`);
    });
    
    // Drag functions
    function dragstarted(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    
    function dragged(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      d.fx = event.x;
      d.fy = event.y;
    }
    
    function dragended(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    
    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [graph]);
  
  return (
    <svg ref={svgRef} width="100%" height="100%"></svg>
  );
}