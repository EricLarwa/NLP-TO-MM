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
const resultRowEl = document.getElementById('result-row');

const urlParams = new URLSearchParams(window.location.search);
const configuredApiUrl = urlParams.get('api');
const PYTHON_API_CANDIDATES = configuredApiUrl
    ? [configuredApiUrl]
    : ['http://127.0.0.1:8000', 'http://127.0.0.1:8001'];

let payloadData = null;
let visualizer = null;
let activeEnterHandler = null;
let activeLeaveHandler = null;
let activePythonApiUrl = null;

const adapter = {
    getSigmaGraphData() {
        return payloadData?.sigmaData || { nodes: [], edges: [] };
    },
};

function setStatus(message) {
    statusEl.textContent = message;
}

function setResult(message) {
    if (resultRowEl) {
        resultRowEl.innerHTML = message;
    }
}

function resetDetails() {
    detailWordEl.textContent = '-';
    detailLanguageEl.textContent = '-';
    detailConfidenceEl.textContent = '-';
    detailDomainEl.textContent = '-';
    detailOccurrencesEl.textContent = '-';
    detailHintEl.textContent = 'Hover a node to inspect metadata.';
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function summarizeResolution(data) {
    const translation = data.translation ? escapeHtml(data.translation) : 'No translation returned';
    const oovTokens = Array.isArray(data.oovTokens)
        ? data.oovTokens.map(token => token.word || token).filter(Boolean)
        : [];
    const resolutions = Array.isArray(data.resolutions) ? data.resolutions : [];

    if (!oovTokens.length) {
        return `<strong>Translation:</strong> ${translation}<br><strong>OOV:</strong> none detected.`;
    }

    const resolvedWords = resolutions
        .filter(resolution => resolution.success || resolution.translation)
        .map(resolution => `${resolution.word} -> ${resolution.translation || 'manual review'}`);

    return `<strong>Translation:</strong> ${translation}<br>` +
        `<strong>OOV:</strong> ${escapeHtml(oovTokens.join(', '))}<br>` +
        `<strong>Resolved:</strong> ${escapeHtml(resolvedWords.join(', ') || 'none')}`;
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

async function findPythonApiUrl() {
    if (activePythonApiUrl) {
        return activePythonApiUrl;
    }

    for (const candidateUrl of PYTHON_API_CANDIDATES) {
        try {
            const response = await fetch(`${candidateUrl}/health`, {
                method: 'GET',
                cache: 'no-store',
            });
            if (response.ok) {
                activePythonApiUrl = candidateUrl;
                return activePythonApiUrl;
            }
        } catch (_error) {
            // Try the next candidate.
        }
    }

    const configuredHint = configuredApiUrl
        ? `Configured API was ${configuredApiUrl}.`
        : 'Tried http://127.0.0.1:8000 and http://127.0.0.1:8001.';
    throw new Error(
        `Model API not found. ${configuredHint} Start Model_Import.py, or open this page with ?api=http://127.0.0.1:<port>.`
    );
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
    const oovSummary =
        typeof stats.oovTokenCount === 'number'
            ? ` | OOV: ${stats.oovTokenCount} (${stats.oovTokenRate ?? stats.unresolvedTokenRate ?? 0}%)`
            : '';
    if (liveData && stats.oovTokenCount === 0) {
        setStatus('Resolved sentence; no OOV tokens were detected, so the graph has no new OOV nodes.');
    } else {
        setStatus(
            `Loaded ${nodes.length} nodes / ${edges.length} edges. ` +
                `Resolved: ${stats.resolvedNodes ?? 'n/a'} | ` +
                `Unresolved: ${stats.unresolvedNodes ?? 'n/a'}${oovSummary}`
        );
    }

    if (liveData) {
        setResult(summarizeResolution(liveData));
    }
}

async function submitText() {
    const text = textInputEl ? textInputEl.value.trim() : '';
    if (!text) {
        setStatus('Enter a sentence to resolve.');
        setResult('Resolve a sentence to see translation and OOV details.');
        return;
    }
    setStatus('Resolving words via Python model...');
    setResult('Waiting for model response...');
    submitBtn.disabled = true;
    try {
        const pythonApiUrl = await findPythonApiUrl();
        const response = await fetch(`${pythonApiUrl}/translate-sentence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, language: 'en' }),
        });
        if (!response.ok) {
            throw new Error(`Model API returned HTTP ${response.status} from ${pythonApiUrl}.`);
        }
        const data = await response.json();
        await renderOrRefresh(data);
    } catch (error) {
        setStatus(`Resolution failed: ${error.message}`);
        setResult('Resolution did not complete. Check that Model_Import.py is running and that the API URL is correct.');
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
