import Graph from 'https://cdn.jsdelivr.net/npm/graphology@0.25.4/+esm';
import Sigma from 'https://cdn.jsdelivr.net/npm/sigma@3.0.0/+esm';

const statusEl = document.getElementById('status');
const container = document.getElementById('graph-container');

function setStatus(message) {
    statusEl.textContent = message;
}

function buildGraph(sigmaData) {
    const graph = new Graph();

    sigmaData.nodes.forEach((node, index) => {
        const angle = index * 0.7;
        const radius = 6 + index * 0.2;

        graph.addNode(node.key, {
            x: node.x ?? Math.cos(angle) * radius,
            y: node.y ?? Math.sin(angle) * radius,
            label: node.label,
            size: node.size || 6,
            color: node.color || '#66BB6A',
            ...node.attributes,
        });
    });

    sigmaData.edges.forEach(edge => {
        if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) {
            return;
        }

        const normalizedAttributes = { ...(edge.attributes || {}) };
        if (normalizedAttributes.type && !normalizedAttributes.semanticType) {
            normalizedAttributes.semanticType = normalizedAttributes.type;
        }
        delete normalizedAttributes.type;

        graph.addEdgeWithKey(edge.key, edge.source, edge.target, {
            size: edge.weight || 1,
            label: edge.label,
            color: '#8B9099',
            ...normalizedAttributes,
        });
    });

    return graph;
}

async function main() {
    setStatus('Loading sample graph data...');

    const response = await fetch('./sample-graph.json');
    if (!response.ok) {
        throw new Error(`sample-graph.json not found (HTTP ${response.status}). Run node Graphing/build-visualization-data.js first.`);
    }

    const payload = await response.json();
    const graph = buildGraph(payload.sigmaData);

    new Sigma(graph, container, {
        renderEdgeLabels: true,
        labelDensity: 0.08,
        labelGridCellSize: 120,
        zIndex: true,
    });

    setStatus(
        `Loaded ${payload.sigmaData.nodes.length} nodes / ${payload.sigmaData.edges.length} edges. ` +
            'Drag to pan, mouse wheel to zoom.'
    );
}

main().catch(error => {
    setStatus(`Visualization failed: ${error.message}`);
    console.error(error);
});
