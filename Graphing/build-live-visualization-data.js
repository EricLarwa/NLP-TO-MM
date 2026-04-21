const fs = require('fs');
const path = require('path');
const {
    NLPKnowledgeGraph,
    EDGE_TYPES,
    CONFIDENCE_STATES,
} = require('./index');

const RESOLVER_BASE_URL = process.env.PYTHON_RESOLVER_URL || 'http://127.0.0.1:8001';
const OUTPUT_PATH = path.join(__dirname, 'sample-graph.json');

function buildNodeId(word, language) {
    return `node_${language}_${word.toLowerCase().replace(/\s+/g, '_')}`;
}

async function checkResolverHealth() {
    const response = await fetch(`${RESOLVER_BASE_URL}/health`);
    if (!response.ok) {
        throw new Error(`Resolver health check failed with HTTP ${response.status}`);
    }
    return response.json();
}

async function main() {
    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is unavailable. Use Node.js 18+ for this script.');
    }

    const health = await checkResolverHealth();
    console.log('Resolver health:', health);

    const graph = new NLPKnowledgeGraph({
        pythonResolverUrl: RESOLVER_BASE_URL,
        pythonResolverTimeoutMs: 12000,
    });

    const textArg = process.argv[2];
    if (textArg) {
        console.log(`Resolving OOV tokens: "${textArg}"`);
        const output = {
            createdAt: new Date().toISOString(),
            source: 'live-resolver',
            resolverBaseUrl: RESOLVER_BASE_URL,
            inputText: textArg,
            ...(await graph.resolveOOVText(textArg, 'en', 'fr')),
        };

        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

        console.log(`Wrote ${OUTPUT_PATH}`);
        console.log('Stats:', output.statistics);
        return;
    }

    let samples;
    samples = [
        { word: 'computer', language: 'en', context: 'The computer runs our translation pipeline.' },
        { word: 'language', language: 'en', context: 'Each language pair has different edge confidence.' },
        { word: 'translation', language: 'en', context: 'Translation results should be persisted in graph form.' },
        { word: 'Mariam', language: 'en', context: 'Mariam reviewed the unresolved terms.' },
    ];

    const resolutions = [];

    for (const sample of samples) {
        const result = await graph.resolveOOVWord(sample.word, sample.language, sample.context);
        resolutions.push({ ...sample, result });

        const sourceNode = graph.getNode(buildNodeId(sample.word, sample.language));

        if (result.resolution) {
            const targetLanguage = sample.language === 'en' ? 'fr' : sample.language;
            const targetNode = graph.getOrCreateNode(result.resolution, targetLanguage);
            graph.updateNodeConfidence(
                targetNode.id,
                CONFIDENCE_STATES.INFERRED,
                result.stage,
                result.resolution
            );
            if (sourceNode && targetNode) {
                graph.addEdge(sourceNode.id, targetNode.id, EDGE_TYPES.TRANSLATES_TO, 0.95);
            }
        }
    }

    const output = {
        createdAt: new Date().toISOString(),
        source: 'live-resolver',
        resolverBaseUrl: RESOLVER_BASE_URL,
        inputText: textArg || null,
        resolutions,
        sigmaData: graph.getSigmaGraphData(),
        statistics: graph.getStatistics(),
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

    console.log(`Wrote ${OUTPUT_PATH}`);
    console.log('Stats:', output.statistics);
}

main().catch(error => {
    console.error('Live visualization build failed:', error.message);
    process.exitCode = 1;
});
