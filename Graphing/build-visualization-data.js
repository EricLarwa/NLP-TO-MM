const fs = require('fs');
const path = require('path');
const {
    NLPKnowledgeGraph,
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
    graph.addTranslation(
        computer.id,
        'ordinateur',
        'fr',
        CONFIDENCE_STATES.VERIFIED,
        RESOLUTION_STAGES.DICTIONARY_LOOKUP,
        0.95,
        { source: 'sample-data' }
    );
    graph.addTranslation(
        computer.id,
        'calculateur',
        'fr',
        CONFIDENCE_STATES.INFERRED,
        RESOLUTION_STAGES.CONTEXT_INFERENCE,
        0.55,
        { source: 'sample-data', note: 'alternate translation for conflict demo' }
    );
    graph.addDomainMembership(computer.id, 'technical');
    graph.addRelatedTerm(computer.id, 'model', 'en', 0.7, { source: 'sample-data' });

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
    graph.addTranslation(
        language.id,
        'langue',
        'fr',
        CONFIDENCE_STATES.VERIFIED,
        RESOLUTION_STAGES.DICTIONARY_LOOKUP,
        0.9,
        { source: 'sample-data' }
    );
    graph.addDomainMembership(language.id, 'general');
    graph.addDerivedFrom(language.id, 'lang', 'en', 0.75, { source: 'sample-data' });

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
