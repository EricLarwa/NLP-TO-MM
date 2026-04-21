const fs = require('fs');
const path = require('path');

const DEFAULT_TARGETS = {
    bleuScore: 28,
    oovTokenRate: 5,
    oovDetectionRecall: 90,
    oovDetectionF1: 80,
    oovResolutionRate: 75,
    graphGrowthRate: 15,
    graphConnectivity: 1.8,
    dominantEdgeTypePercent: 60,
    minimumDomainCount: 4,
};

function tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    return text
        .toLowerCase()
        .match(/\b[\w']+\b/g) || [];
}

function getNgrams(tokens, size) {
    const ngrams = new Map();
    for (let index = 0; index <= tokens.length - size; index += 1) {
        const key = tokens.slice(index, index + size).join(' ');
        ngrams.set(key, (ngrams.get(key) || 0) + 1);
    }
    return ngrams;
}

function computeCorpusBleu(records, maxOrder = 4) {
    const matches = Array(maxOrder).fill(0);
    const totals = Array(maxOrder).fill(0);
    let candidateLength = 0;
    let referenceLength = 0;

    records.forEach(record => {
        const candidateTokens = tokenize(record.prediction || record.translation || '');
        const referenceTokens = tokenize(record.reference || '');
        candidateLength += candidateTokens.length;
        referenceLength += referenceTokens.length;

        for (let order = 1; order <= maxOrder; order += 1) {
            const candidateNgrams = getNgrams(candidateTokens, order);
            const referenceNgrams = getNgrams(referenceTokens, order);

            candidateNgrams.forEach((count, key) => {
                matches[order - 1] += Math.min(count, referenceNgrams.get(key) || 0);
                totals[order - 1] += count;
            });
        }
    });

    if (!candidateLength || !referenceLength) return 0;

    const precisions = matches.map((matchCount, index) => {
        if (totals[index] === 0) return 1;
        return (matchCount + 1) / (totals[index] + 1);
    });
    const logPrecision = precisions.reduce((sum, precision) => sum + Math.log(precision), 0) / maxOrder;
    const brevityPenalty = candidateLength > referenceLength
        ? 1
        : Math.exp(1 - referenceLength / candidateLength);

    return Number((brevityPenalty * Math.exp(logPrecision) * 100).toFixed(2));
}

function normalizeWordList(words) {
    if (!Array.isArray(words)) return new Set();
    return new Set(words.map(word => String(word).toLowerCase()));
}

function getDetectedOOVWords(record) {
    if (Array.isArray(record.detectedOOV)) return normalizeWordList(record.detectedOOV);
    if (Array.isArray(record.oovTokens)) {
        return normalizeWordList(record.oovTokens.map(token => token.word || token));
    }
    if (Array.isArray(record.tokens)) {
        return normalizeWordList(
            record.tokens
                .filter(token => token && token.isOov)
                .map(token => token.word)
        );
    }
    return new Set();
}

function countSetOverlap(left, right) {
    let count = 0;
    left.forEach(value => {
        if (right.has(value)) count += 1;
    });
    return count;
}

function percent(numerator, denominator) {
    if (!denominator) return 0;
    return Number(((numerator / denominator) * 100).toFixed(2));
}

function evaluateOOVDetection(records) {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    let detectedTotal = 0;
    let tokenTotal = 0;
    const baselineRates = [];

    records.forEach(record => {
        const expected = normalizeWordList(record.expectedOOV);
        const detected = getDetectedOOVWords(record);
        truePositive += countSetOverlap(detected, expected);
        falsePositive += Array.from(detected).filter(word => !expected.has(word)).length;
        falseNegative += Array.from(expected).filter(word => !detected.has(word)).length;
        detectedTotal += detected.size;
        tokenTotal += record.totalTokenCount || tokenize(record.source || '').length;
        const baselineRate = record.baselineOOVTokenRate ?? record.baselineUnresolvedTokenRate;
        if (typeof baselineRate === 'number') {
            baselineRates.push(baselineRate);
        }
    });

    const precision = percent(truePositive, truePositive + falsePositive);
    const recall = percent(truePositive, truePositive + falseNegative);
    const f1 = precision + recall ? Number((2 * precision * recall / (precision + recall)).toFixed(2)) : 0;

    const oovTokenRate = percent(detectedTotal, tokenTotal);
    const baselineUnresolvedTokenRate = baselineRates.length
        ? Number((baselineRates.reduce((sum, rate) => sum + rate, 0) / baselineRates.length).toFixed(2))
        : null;

    return {
        truePositive,
        falsePositive,
        falseNegative,
        precision,
        recall,
        f1,
        oovTokenRate,
        baselineUnresolvedTokenRate,
        unresolvedTokenRateReduction: baselineUnresolvedTokenRate === null
            ? null
            : Number((baselineUnresolvedTokenRate - oovTokenRate).toFixed(2)),
    };
}

function evaluateOOVResolution(records) {
    let totalOOV = 0;
    let resolved = 0;
    let correct = 0;
    let reviewable = 0;

    records.forEach(record => {
        const expectedTranslations = record.expectedTranslations || {};
        const resolutions = Array.isArray(record.resolutions) ? record.resolutions : [];
        totalOOV += record.expectedOOV ? record.expectedOOV.length : getDetectedOOVWords(record).size;

        resolutions.forEach(resolution => {
            const word = String(resolution.word || '').toLowerCase();
            const translation = resolution.translation || resolution.result?.translation;
            const success = resolution.success ?? resolution.result?.success;
            if (success || translation) resolved += 1;
            if (!success && !translation) reviewable += 1;
            if (
                expectedTranslations[word] &&
                translation &&
                String(expectedTranslations[word]).toLowerCase() === String(translation).toLowerCase()
            ) {
                correct += 1;
            }
        });
    });

    const resolutionRate = percent(resolved, totalOOV);
    const resolutionPrecision = percent(correct, resolved);
    const resolutionF1 = resolutionPrecision + resolutionRate
        ? Number((2 * resolutionPrecision * resolutionRate / (resolutionPrecision + resolutionRate)).toFixed(2))
        : 0;

    return {
        totalOOV,
        resolved,
        unresolved: Math.max(0, totalOOV - resolved),
        manualReviewCount: reviewable,
        resolutionRate,
        resolutionPrecision,
        resolutionF1,
    };
}

function summarizeGraph(sigmaData, sentenceCount = 0) {
    const nodes = Array.isArray(sigmaData?.nodes) ? sigmaData.nodes : [];
    const edges = Array.isArray(sigmaData?.edges) ? sigmaData.edges : [];
    const nodeIds = new Set(nodes.map(node => node.key));
    const edgeTypeDistribution = {};
    const domains = new Set();
    const confidenceDistribution = {};
    let missingEdgeReferences = 0;

    nodes.forEach(node => {
        const attributes = node.attributes || {};
        if (attributes.domain) domains.add(attributes.domain);
        if (attributes.confidence) {
            confidenceDistribution[attributes.confidence] =
                (confidenceDistribution[attributes.confidence] || 0) + 1;
        }
    });

    edges.forEach(edge => {
        const type = edge.attributes?.semanticType || edge.label || 'unknown';
        edgeTypeDistribution[type] = (edgeTypeDistribution[type] || 0) + 1;
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
            missingEdgeReferences += 1;
        }
    });

    const dominantEdgeTypePercent = edges.length
        ? Number((Math.max(...Object.values(edgeTypeDistribution)) / edges.length * 100).toFixed(2))
        : 0;

    return {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        graphGrowthRate: sentenceCount ? Number((nodes.length / (sentenceCount / 1000)).toFixed(2)) : 0,
        connectivity: nodes.length ? Number((edges.length / nodes.length).toFixed(2)) : 0,
        confidenceDistribution,
        edgeTypeDistribution,
        dominantEdgeTypePercent,
        domainCount: domains.size,
        domains: Array.from(domains).sort(),
        missingEdgeReferences,
        integrityPass: missingEdgeReferences === 0,
    };
}

function aggregateSigmaData(records) {
    const nodes = new Map();
    const edges = new Map();

    records.forEach(record => {
        const sigmaData = record.sigmaData || {};
        (sigmaData.nodes || []).forEach(node => nodes.set(node.key, node));
        (sigmaData.edges || []).forEach(edge => edges.set(edge.key, edge));
    });

    return {
        nodes: Array.from(nodes.values()),
        edges: Array.from(edges.values()),
    };
}

function evaluateRecords(records, options = {}) {
    const targets = { ...DEFAULT_TARGETS, ...(options.targets || {}) };
    const sentenceCount = records.length;
    const translationMetrics = {
        bleuScore: computeCorpusBleu(records),
    };
    const oovDetection = evaluateOOVDetection(records);
    const oovResolution = evaluateOOVResolution(records);
    const graphMetrics = summarizeGraph(
        options.sigmaData || aggregateSigmaData(records),
        sentenceCount
    );

    const checks = {
        bleuScore: translationMetrics.bleuScore >= targets.bleuScore,
        oovTokenRate: oovDetection.oovTokenRate <= targets.oovTokenRate,
        oovDetectionRecall: oovDetection.recall >= targets.oovDetectionRecall,
        oovDetectionF1: oovDetection.f1 >= targets.oovDetectionF1,
        oovResolutionRate: oovResolution.resolutionRate >= targets.oovResolutionRate,
        graphGrowthRate: graphMetrics.graphGrowthRate >= targets.graphGrowthRate,
        graphConnectivity: graphMetrics.connectivity >= targets.graphConnectivity,
        dominantEdgeTypePercent: graphMetrics.dominantEdgeTypePercent <= targets.dominantEdgeTypePercent,
        domainCoverage: graphMetrics.domainCount >= targets.minimumDomainCount,
        graphIntegrity: graphMetrics.integrityPass,
    };

    return {
        generatedAt: new Date().toISOString(),
        sentenceCount,
        targets,
        translationMetrics,
        oovDetection,
        oovResolution,
        graphMetrics,
        checks,
        overallStatus: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
    };
}

function loadEvaluationInput(inputPath) {
    const absolutePath = path.resolve(inputPath);
    const payload = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
    if (Array.isArray(payload)) {
        return {
            records: payload,
            targets: {},
            name: path.basename(inputPath),
        };
    }
    if (Array.isArray(payload.records)) {
        return {
            records: payload.records,
            targets: payload.targets || {},
            name: payload.name || path.basename(inputPath),
        };
    }
    throw new Error('Evaluation input must be an array or an object with a records array.');
}

function printReport(result) {
    console.log(`# Evaluation Run: ${result.generatedAt}`);
    if (result.inputName) {
        console.log(`Input: ${result.inputName}`);
    }
    console.log(`Overall Status: ${result.overallStatus}`);
    console.log(`Sentences: ${result.sentenceCount}`);
    console.log('');
    console.log('Translation Metrics');
    console.log(`- BLEU Score: ${result.translationMetrics.bleuScore}`);
    console.log('');
    console.log('OOV Detection');
    console.log(`- Precision: ${result.oovDetection.precision}%`);
    console.log(`- Recall: ${result.oovDetection.recall}%`);
    console.log(`- F1: ${result.oovDetection.f1}%`);
    console.log(`- OOV Token Rate: ${result.oovDetection.oovTokenRate}%`);
    if (result.oovDetection.baselineUnresolvedTokenRate !== null) {
        console.log(`- Baseline Unresolved Token Rate: ${result.oovDetection.baselineUnresolvedTokenRate}%`);
        console.log(`- Unresolved Token Rate Reduction: ${result.oovDetection.unresolvedTokenRateReduction}%`);
    }
    console.log('');
    console.log('OOV Resolution');
    console.log(`- Resolution Rate: ${result.oovResolution.resolutionRate}%`);
    console.log(`- Resolution Precision: ${result.oovResolution.resolutionPrecision}%`);
    console.log(`- Resolution F1: ${result.oovResolution.resolutionF1}%`);
    console.log('');
    console.log('Knowledge Graph');
    console.log(`- Nodes: ${result.graphMetrics.totalNodes}`);
    console.log(`- Edges: ${result.graphMetrics.totalEdges}`);
    console.log(`- Growth Rate: ${result.graphMetrics.graphGrowthRate} nodes / 1K sentences`);
    console.log(`- Connectivity: ${result.graphMetrics.connectivity} edges / node`);
    console.log(`- Domains: ${result.graphMetrics.domains.join(', ') || '(none)'}`);
    console.log(`- Edge Types: ${JSON.stringify(result.graphMetrics.edgeTypeDistribution)}`);
    console.log('');
    console.log('Checks');
    Object.entries(result.checks).forEach(([name, passed]) => {
        console.log(`- ${name}: ${passed ? 'PASS' : 'FAIL'}`);
    });
}

function main() {
    const inputPath = process.argv[2] || path.join(__dirname, 'sample-evaluation-set.json');
    const outputPath = process.argv[3] || null;
    const evaluationInput = loadEvaluationInput(inputPath);
    const result = evaluateRecords(evaluationInput.records, {
        targets: evaluationInput.targets,
    });
    result.inputName = evaluationInput.name;
    printReport(result);

    if (outputPath) {
        fs.writeFileSync(path.resolve(outputPath), JSON.stringify(result, null, 2), 'utf-8');
        console.log('');
        console.log(`Wrote evaluation report: ${outputPath}`);
    }
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(`Evaluation failed: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = {
    DEFAULT_TARGETS,
    aggregateSigmaData,
    computeCorpusBleu,
    evaluateOOVDetection,
    evaluateOOVResolution,
    evaluateRecords,
    loadEvaluationInput,
    summarizeGraph,
};
