const KnowledgeGraphNode = require('./KnowledgeGraphNode');
const KnowledgeGraphEdge = require('./KnowledgeGraphEdge');
const {
    EDGE_TYPES,
    CONFIDENCE_STATES,
    SEMANTIC_DOMAINS,
    RESOLUTION_STAGES,
} = require('./constants');

class NLPKnowledgeGraph {
    constructor(options = {}) {
        this.nodes = new Map();
        this.edges = new Map();
        this.edgeIndex = 0;
        this.pythonResolverUrl =
            options.pythonResolverUrl || process.env.PYTHON_RESOLVER_URL || 'http://127.0.0.1:8000';
        this.pythonResolverTimeoutMs = options.pythonResolverTimeoutMs || 7000;
        this.sigmaGraphData = {
            nodes: [],
            edges: [],
        };
        this.statistics = {
            totalNodesProcessed: 0,
            resolvedNodes: 0,
            unresolvedNodes: 0,
            resolutionSuccessRate: 0,
        };
    }

    getOrCreateNode(word, language, domain = SEMANTIC_DOMAINS.GENERAL) {
        const nodeId = this._generateNodeId(word, language);

        if (this.nodes.has(nodeId)) {
            const node = this.nodes.get(nodeId);
            node.recordOccurrence();
            return node;
        }

        const node = new KnowledgeGraphNode(nodeId, word, language, domain);
        this.nodes.set(nodeId, node);
        this.statistics.totalNodesProcessed += 1;
        this.statistics.unresolvedNodes += 1;

        this._addNodeToSigmaGraph(node);

        return node;
    }

    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }

    updateNodeConfidence(nodeId, newStatus, stage, translation = null) {
        const node = this.nodes.get(nodeId);
        if (!node) return null;

        const oldStatus = node.confidenceStatus;
        node.markResolved(stage, newStatus, translation);

        if (oldStatus === CONFIDENCE_STATES.UNKNOWN && newStatus !== CONFIDENCE_STATES.UNKNOWN) {
            this.statistics.unresolvedNodes = Math.max(0, this.statistics.unresolvedNodes - 1);
            this.statistics.resolvedNodes += 1;
            this._updateResolutionRate();
        }

        return node;
    }

    addEdge(sourceId, targetId, edgeType, weight = 0.5, metadata = {}) {
        const source = this.nodes.get(sourceId);
        const target = this.nodes.get(targetId);

        if (!source || !target) {
            console.warn('Cannot create edge: source or target node not found');
            return null;
        }

        const edgeId = `edge_${this.edgeIndex++}`;
        const edge = new KnowledgeGraphEdge(sourceId, targetId, edgeType, weight, metadata, edgeId);
        this.edges.set(edgeId, edge);

        this._addEdgeToSigmaGraph(edgeId, edge);

        return edge;
    }

    getEdgesByType(sourceId, edgeType) {
        return Array.from(this.edges.values()).filter(
            edge => edge.sourceId === sourceId && edge.type === edgeType
        );
    }

    getRelatedNodes(nodeId, edgeType) {
        return this.getEdgesByType(nodeId, edgeType)
            .map(edge => this.nodes.get(edge.targetId))
            .filter(node => node !== undefined);
    }

    async resolveOOVWord(word, language, sourceContext = null) {
        const node = this.getOrCreateNode(word, language);

        let result = await this._contextInference(word, language, sourceContext);
        if (result.success) {
            this.updateNodeConfidence(
                node.id,
                CONFIDENCE_STATES.INFERRED,
                RESOLUTION_STAGES.CONTEXT_INFERENCE,
                result.translation
            );
            return {
                resolution: result.translation,
                stage: RESOLUTION_STAGES.CONTEXT_INFERENCE,
                confidence: CONFIDENCE_STATES.INFERRED,
            };
        }

        result = await this._dictionaryLookup(word, language);
        if (result.success) {
            this.updateNodeConfidence(
                node.id,
                CONFIDENCE_STATES.VERIFIED,
                RESOLUTION_STAGES.DICTIONARY_LOOKUP,
                result.translation
            );
            return {
                resolution: result.translation,
                stage: RESOLUTION_STAGES.DICTIONARY_LOOKUP,
                confidence: CONFIDENCE_STATES.VERIFIED,
            };
        }

        result = await this._transliteration(word, language);
        if (result.success) {
            this.updateNodeConfidence(
                node.id,
                CONFIDENCE_STATES.INFERRED,
                RESOLUTION_STAGES.TRANSLITERATION,
                result.translation
            );
            return {
                resolution: result.translation,
                stage: RESOLUTION_STAGES.TRANSLITERATION,
                confidence: CONFIDENCE_STATES.INFERRED,
            };
        }

        this.updateNodeConfidence(
            node.id,
            CONFIDENCE_STATES.UNKNOWN,
            RESOLUTION_STAGES.MANUAL_REVIEW
        );

        return {
            resolution: null,
            stage: RESOLUTION_STAGES.MANUAL_REVIEW,
            confidence: CONFIDENCE_STATES.UNKNOWN,
            flaggedForReview: true,
        };
    }

    async detectOOVWords(text, language = 'en') {
        if (!text || typeof text !== 'string') {
            return {
                tokens: [],
                oovTokens: [],
                totalTokenCount: 0,
                oovTokenCount: 0,
                oovTokenRate: 0,
                unresolvedTokenRate: 0,
            };
        }

        const result = await this._callPythonResolverEndpoint('/detect-oov', {
            text,
            language,
        });

        return {
            tokens: Array.isArray(result.tokens) ? result.tokens : [],
            oovTokens: Array.isArray(result.oovTokens) ? result.oovTokens : [],
            totalTokenCount: result.totalTokenCount || 0,
            oovTokenCount: result.oovTokenCount || 0,
            oovTokenRate: result.oovTokenRate || result.unresolvedTokenRate || 0,
            unresolvedTokenRate: result.unresolvedTokenRate || 0,
            model: result.model || null,
            unkToken: result.unkToken || null,
            unkTokenId: result.unkTokenId ?? null,
        };
    }

    async _contextInference(word, language, context) {
        return this._callPythonResolver(
            RESOLUTION_STAGES.CONTEXT_INFERENCE,
            word,
            language,
            context
        );
    }

    async _dictionaryLookup(word, targetLanguage) {
        return this._callPythonResolver(
            RESOLUTION_STAGES.DICTIONARY_LOOKUP,
            word,
            targetLanguage,
            null
        );
    }

    async _transliteration(word, language) {
        return this._callPythonResolver(
            RESOLUTION_STAGES.TRANSLITERATION,
            word,
            language,
            null
        );
    }

    async _callPythonResolver(stageHint, word, language, sourceContext) {
        const payload = await this._callPythonResolverEndpoint('/resolve', {
            word,
            language,
            sourceContext,
            stageHint,
        });

        return {
            success: Boolean(payload.success),
            translation: payload.translation || null,
            stage: payload.stage || stageHint,
            confidence: payload.confidence || CONFIDENCE_STATES.UNKNOWN,
            domain: payload.domain || SEMANTIC_DOMAINS.GENERAL,
            relatedTerms: Array.isArray(payload.relatedTerms) ? payload.relatedTerms : [],
        };
    }

    async _callPythonResolverEndpoint(path, body) {
        if (typeof fetch !== 'function') {
            console.warn('Global fetch is unavailable. Python resolver call skipped.');
            return {};
        }

        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), this.pythonResolverTimeoutMs);

        try {
            const response = await fetch(`${this.pythonResolverUrl}${path}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            if (!response.ok) {
                console.warn(`Python resolver returned ${response.status}`);
                return {};
            }

            return response.json();
        } catch (error) {
            console.warn(`Python resolver request failed: ${error.message}`);
            return {};
        } finally {
            clearTimeout(timeoutHandle);
        }
    }

    getSigmaGraphData() {
        const colorMap = {
            [CONFIDENCE_STATES.UNKNOWN]: '#FF6B6B',
            [CONFIDENCE_STATES.INFERRED]: '#FFA726',
            [CONFIDENCE_STATES.VERIFIED]: '#66BB6A',
        };

        const nodes = Array.from(this.nodes.values()).map(node => ({
            key: node.id,
            label: node.word,
            size: Math.log(node.occurrenceCount + 1) * 3 + 5,
            color: colorMap[node.confidenceStatus],
            attributes: {
                language: node.language,
                domain: node.domain,
                confidence: node.confidenceStatus,
                occurrences: node.occurrenceCount,
            },
        }));

        const edges = Array.from(this.edges.entries()).map(([edgeId, edge]) => ({
            key: edge.id || edgeId,
            source: edge.sourceId,
            target: edge.targetId,
            label: edge.type,
            weight: edge.weight,
            attributes: {
                semanticType: edge.type,
                ...edge.metadata,
            },
        }));

        return { nodes, edges };
    }

    _addNodeToSigmaGraph(node) {
        // Snapshot used during node creation for initialization only
        // getSigmaGraphData() rebuilds from current state on demand
    }

    _addEdgeToSigmaGraph(edgeId, edge) {
        // Edge stored in this.edges Map
        // getSigmaGraphData() rebuilds edges on demand
    }

    _updateResolutionRate() {
        const total = this.statistics.resolvedNodes + this.statistics.unresolvedNodes;
        if (total > 0) {
            this.statistics.resolutionSuccessRate = parseFloat(
                ((this.statistics.resolvedNodes / total) * 100).toFixed(2)
            );
        }
    }

    getStatistics() {
        return {
            ...this.statistics,
            totalNodes: this.nodes.size,
            totalEdges: this.edges.size,
        };
    }

    getUnresolvedReport() {
        return Array.from(this.nodes.values())
            .filter(node => node.confidenceStatus === CONFIDENCE_STATES.UNKNOWN)
            .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
            .map(node => ({
                word: node.word,
                language: node.language,
                domain: node.domain,
                occurrences: node.occurrenceCount,
                examples: node.metadata.contextExamples,
            }));
    }

    getResolvedReport() {
        const byConfidence = {};

        Object.values(CONFIDENCE_STATES).forEach(state => {
            byConfidence[state] = Array.from(this.nodes.values())
                .filter(node => node.confidenceStatus === state)
                .map(node => ({
                    word: node.word,
                    language: node.language,
                    domain: node.domain,
                    resolutionPath: node.resolutionPath,
                    occurrences: node.occurrenceCount,
                }));
        });

        return byConfidence;
    }

    _generateNodeId(word, language) {
        return `node_${language}_${word.toLowerCase().replace(/\s+/g, '_')}`;
    }

    exportGraph() {
        return {
            nodes: Array.from(this.nodes.values()),
            edges: Array.from(this.edges.entries()).map(([edgeId, edge]) => ({
                ...edge,
                id: edge.id || edgeId,
            })),
            statistics: this.statistics,
            exportedAt: new Date(),
        };
    }

    importGraph(data) {
        if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
            throw new Error('Invalid graph import payload. Expected nodes and edges arrays.');
        }

        this.clear();

        data.nodes.forEach(rawNode => {
            const node = new KnowledgeGraphNode(
                rawNode.id,
                rawNode.word,
                rawNode.language,
                rawNode.domain
            );

            node.confidenceStatus = rawNode.confidenceStatus || CONFIDENCE_STATES.UNKNOWN;
            node.createdAt = rawNode.createdAt ? new Date(rawNode.createdAt) : new Date();
            node.lastUpdated = rawNode.lastUpdated ? new Date(rawNode.lastUpdated) : node.createdAt;
            node.resolutionPath = Array.isArray(rawNode.resolutionPath)
                ? rawNode.resolutionPath.map(step => ({
                    ...step,
                    timestamp: step.timestamp ? new Date(step.timestamp) : new Date(),
                }))
                : [];
            node.occurrenceCount = rawNode.occurrenceCount || 1;
            node.metadata = {
                partOfSpeech: null,
                morphologicalRoot: null,
                contextExamples: [],
                ...(rawNode.metadata || {}),
            };

            this.nodes.set(node.id, node);
        });

        data.edges.forEach((rawEdge, index) => {
            const edgeId = rawEdge.id || `edge_${index}`;
            const edge = new KnowledgeGraphEdge(
                rawEdge.sourceId,
                rawEdge.targetId,
                rawEdge.type,
                rawEdge.weight,
                rawEdge.metadata || {},
                edgeId
            );

            edge.createdAt = rawEdge.createdAt ? new Date(rawEdge.createdAt) : new Date();
            this.edges.set(edgeId, edge);
        });

        this.edgeIndex = this._getNextEdgeIndex();
        this.statistics = data.statistics
            ? { ...this.statistics, ...data.statistics }
            : this._recalculateStatistics();
        this._updateResolutionRate();

        return this.getStatistics();
    }

    _getNextEdgeIndex() {
        return Array.from(this.edges.keys()).reduce((nextIndex, edgeId) => {
            const match = /^edge_(\d+)$/.exec(edgeId);
            if (!match) return nextIndex;
            return Math.max(nextIndex, Number(match[1]) + 1);
        }, this.edges.size);
    }

    _recalculateStatistics() {
        const nodes = Array.from(this.nodes.values());
        const resolvedNodes = nodes.filter(
            node => node.confidenceStatus !== CONFIDENCE_STATES.UNKNOWN
        ).length;
        const unresolvedNodes = nodes.length - resolvedNodes;

        return {
            totalNodesProcessed: nodes.length,
            resolvedNodes,
            unresolvedNodes,
            resolutionSuccessRate: 0,
        };
    }

    clear() {
        this.nodes.clear();
        this.edges.clear();
        this.sigmaGraphData = { nodes: [], edges: [] };
        this.statistics = {
            totalNodesProcessed: 0,
            resolvedNodes: 0,
            unresolvedNodes: 0,
            resolutionSuccessRate: 0,
        };
    }
}

module.exports = NLPKnowledgeGraph;
