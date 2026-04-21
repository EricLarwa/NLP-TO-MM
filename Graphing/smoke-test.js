const {
    NLPKnowledgeGraph,
    EDGE_TYPES,
} = require('./index');

const RESOLVER_BASE_URL = process.env.PYTHON_RESOLVER_URL || 'http://127.0.0.1:8001';

function buildNodeId(word, language) {
    return `node_${language}_${word.toLowerCase().replace(/\s+/g, '_')}`;
}

async function checkResolverHealth() {
    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is unavailable. Use Node.js 18+ for this smoke test.');
    }

    const response = await fetch(`${RESOLVER_BASE_URL}/health`);
    if (!response.ok) {
        throw new Error(`Resolver health check failed with HTTP ${response.status}`);
    }

    return response.json();
}

async function run() {
    const health = await checkResolverHealth();
    console.log('Resolver health:', health);

    const graph = new NLPKnowledgeGraph({
        pythonResolverUrl: RESOLVER_BASE_URL,
        pythonResolverTimeoutMs: 10000,
    });

    const samples = [
        { word: 'computer', language: 'en', context: 'The computer runs the NLP model.' },
        { word: 'translation', language: 'en', context: 'The translation should be stored in the graph.' },
        { word: 'Mariam', language: 'en', context: 'Mariam reviewed the model output.' },
    ];

    for (const sample of samples) {
        const result = await graph.resolveOOVWord(sample.word, sample.language, sample.context);
        const sourceNode = graph.getNode(buildNodeId(sample.word, sample.language));

        if (result.resolution) {
            const targetLanguage = sample.language === 'en' ? 'fr' : sample.language;
            const targetNode = graph.getOrCreateNode(result.resolution, targetLanguage);
            if (sourceNode && targetNode) {
                graph.addEdge(sourceNode.id, targetNode.id, EDGE_TYPES.TRANSLATES_TO, 0.95);
            }
        }

        console.log(`${sample.word} ->`, result);
    }

    console.log('Graph stats:', graph.getStatistics());
    const sigmaData = graph.getSigmaGraphData();
    console.log('Sigma nodes:', sigmaData.nodes.length, 'Sigma edges:', sigmaData.edges.length);
}

run().catch(error => {
    console.error('Smoke test failed:', error.message);
    process.exitCode = 1;
});
