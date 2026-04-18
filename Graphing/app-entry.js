import Graph from 'https://cdn.jsdelivr.net/npm/graphology@0.25.4/+esm';
import Sigma from 'https://cdn.jsdelivr.net/npm/sigma@3.0.0/+esm';

const statusEl = document.getElementById('status');
const detailWordEl = document.getElementById('detail-word');
const detailLanguageEl = document.getElementById('detail-language');
const detailConfidenceEl = document.getElementById('detail-confidence');
const detailDomainEl = document.getElementById('detail-domain');
const detailOccurrencesEl = document.getElementById('detail-occurrences');
const detailHintEl = document.getElementById('detail-hint');
const refreshBtn = document.getElementById('refresh-btn');
const textInputEl = document.getElementById('text-input');
const submitBtn = document.getElementById('submit-btn');

const PYTHON_API_URL = 'http://127.0.0.1:8000';

let payloadData = null;
let visualizer = null;
let activeEnterHandler = null;
let activeLeaveHandler = null;

const adapter = {
    getSigmaGraphData() {
        return payloadData?.sigmaData || { nodes: [], edges: [] };
    },
};

function setStatus(message) {
    statusEl.textContent = message;
}

function resetDetails() {
    detailWordEl.textContent = '-';
    detailLanguageEl.textContent = '-';
    detailConfidenceEl.textContent = '-';
    detailDomainEl.textContent = '-';
    detailOccurrencesEl.textContent = '-';
    detailHintEl.textContent = 'Hover a node to inspect metadata.';
}

function wireNodeInteractions() {
    if (!visualizer || !visualizer.sigmaInstance || !visualizer.graph) {
        return;
    }

    if (activeEnterHandler) {
        visualizer.sigmaInstance.off('enterNode', activeEnterHandler);
    }
    if (activeLeaveHandler) {
        visualizer.sigmaInstance.off('leaveNode', activeLeaveHandler);
    }

    activeEnterHandler = ({ node }) => {
        const attrs = visualizer.graph.getNodeAttributes(node);
        detailWordEl.textContent = attrs.label || node;
        detailLanguageEl.textContent = attrs.language || '-';
        detailConfidenceEl.textContent = attrs.confidence || '-';
        detailDomainEl.textContent = attrs.domain || '-';
        detailOccurrencesEl.textContent = String(attrs.occurrences || 0);
        detailHintEl.textContent = `Node id: ${node}`;
    };

    activeLeaveHandler = () => {
        resetDetails();
    };

    visualizer.sigmaInstance.on('enterNode', activeEnterHandler);
    visualizer.sigmaInstance.on('leaveNode', activeLeaveHandler);
}

async function loadPayload() {
    const response = await fetch(`./sample-graph.json?ts=${Date.now()}`);
    if (!response.ok) {
        throw new Error(
            `sample-graph.json not found (HTTP ${response.status}). Run node Graphing/build-live-visualization-data.js first.`
        );
    }
    payloadData = await response.json();
}

async function renderOrRefresh(liveData) {
    if (liveData) {
        payloadData = liveData;
    } else {
        await loadPayload();
    }

    if (!visualizer) {
        if (!window.GraphVisualizer) {
            throw new Error('GraphVisualizer script is not loaded.');
        }

        const nextVisualizer = new window.GraphVisualizer('#graph-container', adapter, {
            Graph,
            Sigma,
            sigmaSettings: {
                renderEdgeLabels: true,
                labelDensity: 0.09,
                labelGridCellSize: 120,
                zIndex: true,
            },
        });

        await nextVisualizer.initialize();
        visualizer = nextVisualizer;
    } else {
        await visualizer.refresh();
    }

    resetDetails();
    wireNodeInteractions();

    const { nodes, edges } = adapter.getSigmaGraphData();
    const stats = payloadData.statistics || {};
    setStatus(
        `Loaded ${nodes.length} nodes / ${edges.length} edges. ` +
            `Resolved: ${stats.resolvedNodes ?? 'n/a'} | ` +
            `Unresolved: ${stats.unresolvedNodes ?? 'n/a'}`
    );
}

async function submitText() {
    const text = textInputEl ? textInputEl.value.trim() : '';
    if (!text) {
        setStatus('Enter a sentence to resolve.');
        return;
    }
    setStatus('Resolving words via Python model...');
    submitBtn.disabled = true;
    try {
        const response = await fetch(`${PYTHON_API_URL}/translate-sentence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, language: 'en' }),
        });
        if (!response.ok) {
            throw new Error(`Model API returned HTTP ${response.status}. Is Model_Import.py running?`);
        }
        const data = await response.json();
        await renderOrRefresh(data);
    } catch (error) {
        setStatus(`Resolution failed: ${error.message}`);
    } finally {
        submitBtn.disabled = false;
    }
}

async function main() {
    setStatus('Loading graph data...');
    resetDetails();

    refreshBtn.addEventListener('click', async () => {
        setStatus('Refreshing graph...');
        try {
            await renderOrRefresh();
        } catch (error) {
            setStatus(`Refresh failed: ${error.message}`);
        }
    });

    if (submitBtn) {
        submitBtn.addEventListener('click', submitText);
    }

    if (textInputEl) {
        textInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitText();
        });
    }

    await renderOrRefresh();
}

main().catch(error => {
    setStatus(`Visualization failed: ${error.message}`);
    console.error(error);
});
