const fs = require('fs');
const path = require('path');
const {
    NLPKnowledgeGraph,
    EDGE_TYPES,
    CONFIDENCE_STATES,
    RESOLUTION_STAGES,
} = require('./index');

function main() {
    const graph = new NLPKnowledgeGraph();

    const computer = graph.getOrCreateNode('computer', 'en');
    const ordinateur = graph.getOrCreateNode('ordinateur', 'fr');
    graph.updateNodeConfidence(
        computer.id,
        CONFIDENCE_STATES.INFERRED,
        RESOLUTION_STAGES.CONTEXT_INFERENCE,
        'ordinateur'
    );
    graph.updateNodeConfidence(
        ordinateur.id,
        CONFIDENCE_STATES.VERIFIED,
        RESOLUTION_STAGES.DICTIONARY_LOOKUP,
        'ordinateur'
    );
    graph.addEdge(computer.id, ordinateur.id, EDGE_TYPES.TRANSLATES_TO, 0.95);

    const language = graph.getOrCreateNode('language', 'en');
    const langue = graph.getOrCreateNode('langue', 'fr');
    graph.updateNodeConfidence(
        language.id,
        CONFIDENCE_STATES.INFERRED,
        RESOLUTION_STAGES.CONTEXT_INFERENCE,
        'langue'
    );
    graph.updateNodeConfidence(
        langue.id,
        CONFIDENCE_STATES.VERIFIED,
        RESOLUTION_STAGES.DICTIONARY_LOOKUP,
        'langue'
    );
    graph.addEdge(language.id, langue.id, EDGE_TYPES.TRANSLATES_TO, 0.9);

    const unresolved = graph.getOrCreateNode('Mariam', 'en');
    graph.updateNodeConfidence(
        unresolved.id,
        CONFIDENCE_STATES.UNKNOWN,
        RESOLUTION_STAGES.MANUAL_REVIEW,
        null
    );

    const output = {
        createdAt: new Date().toISOString(),
        sigmaData: graph.getSigmaGraphData(),
        statistics: graph.getStatistics(),
    };

    const outputPath = path.join(__dirname, 'sample-graph.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

    console.log(`Wrote ${outputPath}`);
    console.log('Stats:', output.statistics);
}

main();
