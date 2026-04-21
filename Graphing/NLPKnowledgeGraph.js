const KnowledgeGraphNode = require('./KnowledgeGraphNode');
const KnowledgeGraphEdge = require('./KnowledgeGraphEdge');
const {
    EDGE_TYPES,
    CONFIDENCE_STATES,
    SEMANTIC_DOMAINS,
    RESOLUTION_STAGES,
} = require('./constants');

const EDGE_COLORS = {
    [EDGE_TYPES.TRANSLATES_TO]: '#4F8EF7',
    [EDGE_TYPES.BELONGS_TO]: '#7E57C2',
    [EDGE_TYPES.RELATED_TO]: '#26A69A',
    [EDGE_TYPES.DERIVED_FROM]: '#8D6E63',
    [EDGE_TYPES.CONFLICTS_WITH]: '#EF5350',
};

class NLPKnowledgeGraph {
    constructor(options = {}) {
        this.nodes = new Map();
        this.edges = new Map();
        this.edgeIndex = 0;
        this.pythonResolverUrl =
            options.pythonResolverUrl || process.env.PYTHON_RESOLVER_URL || 'http://127.0.0.1:8001';
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

    getOrCreateNode(word, language, domain = SEMANTIC_DOMAINS.GENERAL, context = null) {
        const nodeId = this._generateNodeId(word, language);

        if (this.nodes.has(nodeId)) {
            const node = this.nodes.get(nodeId);
            node.recordOccurrence(context);
            return node;
        }

        const node = new KnowledgeGraphNode(nodeId, word, language, domain);
        if (context) {
            node.metadata.contextExamples.push({
                context,
                timestamp: new Date(),
            });
        }
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

        if (!Object.values(EDGE_TYPES).includes(edgeType)) {
            console.warn(`Cannot create edge: unsupported edge type "${edgeType}"`);
            return null;
        }

        const existingEdge = this._findEdge(sourceId, targetId, edgeType);
        if (existingEdge) {
            existingEdge.weight = Math.max(existingEdge.weight, Math.max(0, Math.min(1, weight)));
            existingEdge.metadata = {
                ...existingEdge.metadata,
                ...metadata,
            };
            return existingEdge;
        }

        const edgeId = `edge_${this.edgeIndex++}`;
        const edge = new KnowledgeGraphEdge(sourceId, targetId, edgeType, weight, metadata, edgeId);
        this.edges.set(edgeId, edge);

        this._addEdgeToSigmaGraph(edgeId, edge);

        return edge;
    }

    addSemanticRelation(sourceId, targetId, edgeType, weight = 0.5, metadata = {}) {
        return this.addEdge(sourceId, targetId, edgeType, weight, {
            source: 'semantic-relation',
            ...metadata,
        });
    }

    addDomainMembership(nodeId, domain, weight = 1) {
        const node = this.nodes.get(nodeId);
        if (!node || !domain) return null;

        const normalizedDomain = this._normalizeDomain(domain);
        node.domain = normalizedDomain;

        const domainNode = this.getOrCreateDomainNode(normalizedDomain);
        return this.addSemanticRelation(node.id, domainNode.id, EDGE_TYPES.BELONGS_TO, weight, {
            domain: normalizedDomain,
        });
    }

    getOrCreateDomainNode(domain) {
        const normalizedDomain = this._normalizeDomain(domain);
        const nodeId = this._generateDomainNodeId(normalizedDomain);

        if (this.nodes.has(nodeId)) {
            return this.nodes.get(nodeId);
        }

        const node = new KnowledgeGraphNode(
            nodeId,
            normalizedDomain,
            'domain',
            normalizedDomain
        );
        node.confidenceStatus = CONFIDENCE_STATES.VERIFIED;
        node.metadata.nodeType = 'semantic_domain';
        this.nodes.set(nodeId, node);
        this.statistics.totalNodesProcessed += 1;
        this.statistics.resolvedNodes += 1;
        this._updateResolutionRate();

        return node;
    }

    addRelatedTerm(sourceId, relatedWord, language = null, weight = 0.6, metadata = {}) {
        const source = this.nodes.get(sourceId);
        if (!source || !relatedWord) return null;

        const relatedNode = this.getOrCreateNode(
            relatedWord,
            language || source.language,
            source.domain
        );

        return this.addSemanticRelation(source.id, relatedNode.id, EDGE_TYPES.RELATED_TO, weight, {
            relation: 'semantic_neighbor',
            ...metadata,
        });
    }

    addDerivedFrom(sourceId, rootWord, language = null, weight = 0.8, metadata = {}) {
        const source = this.nodes.get(sourceId);
        if (!source || !rootWord) return null;

        const rootNode = this.getOrCreateNode(
            rootWord,
            language || source.language,
            source.domain
        );
        source.metadata.morphologicalRoot = rootWord;

        return this.addSemanticRelation(source.id, rootNode.id, EDGE_TYPES.DERIVED_FROM, weight, {
            root: rootWord,
            ...metadata,
        });
    }

    addTranslation(sourceId, targetWord, targetLanguage, confidence, stage, weight = 0.8, metadata = {}) {
        const sourceNode = this.nodes.get(sourceId);
        if (!sourceNode || !targetWord || !targetLanguage) return null;

        const targetNode = this.getOrCreateNode(
            targetWord,
            targetLanguage,
            metadata.domain || sourceNode.domain
        );

        this.updateNodeConfidence(targetNode.id, confidence, stage, targetWord);

        const translationEdge = this.addEdge(
            sourceNode.id,
            targetNode.id,
            EDGE_TYPES.TRANSLATES_TO,
            weight,
            {
                resolutionStage: stage,
                confidence,
                source: 'translation-resolution',
                ...metadata,
            }
        );

        this._addConflictsForCompetingTranslations(sourceNode.id, targetNode.id, {
            sourceWord: sourceNode.word,
            targetLanguage,
            resolutionStage: stage,
        });

        return {
            targetNode,
            translationEdge,
        };
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

    getSemanticRelations(nodeId = null) {
        return Array.from(this.edges.values())
            .filter(edge => !nodeId || edge.sourceId === nodeId || edge.targetId === nodeId)
            .map(edge => ({
                type: edge.type,
                source: this.nodes.get(edge.sourceId),
                target: this.nodes.get(edge.targetId),
                weight: edge.weight,
                metadata: edge.metadata,
            }));
    }

    async resolveOOVWord(word, language, sourceContext = null) {
        const node = this.getOrCreateNode(word, language, SEMANTIC_DOMAINS.GENERAL, sourceContext);

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
                domain: result.domain,
                relatedTerms: result.relatedTerms,
                morphologicalRoot: result.morphologicalRoot,
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
                domain: result.domain,
                relatedTerms: result.relatedTerms,
                morphologicalRoot: result.morphologicalRoot,
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
                domain: result.domain,
                relatedTerms: result.relatedTerms,
                morphologicalRoot: result.morphologicalRoot,
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
            domain: SEMANTIC_DOMAINS.GENERAL,
            relatedTerms: [],
            morphologicalRoot: null,
        };
    }

    async resolveOOVText(text, language = 'en', targetLanguage = 'fr') {
        const detection = await this.detectOOVWords(text, language);
        const resolutions = [];

        for (const token of detection.oovTokens) {
            const result = await this.resolveOOVWord(token.word, language, text);
            const sourceNode = this.getNode(this._generateNodeId(token.word, language));
            if (sourceNode) {
                sourceNode.metadata.tokenInspection = token;
            }

            if (sourceNode && result.resolution) {
                this.addTranslation(
                    sourceNode.id,
                    result.resolution,
                    targetLanguage,
                    result.confidence,
                    result.stage,
                    result.confidence === CONFIDENCE_STATES.VERIFIED ? 0.95 : 0.8,
                    {
                        source: 'oov-resolution',
                        domain: result.domain,
                    }
                );
            }

            if (sourceNode && result.domain) {
                this.addDomainMembership(sourceNode.id, result.domain);
            }

            if (sourceNode && Array.isArray(result.relatedTerms)) {
                result.relatedTerms.forEach(term => {
                    const relatedWord = typeof term === 'string' ? term : term.word;
                    const relatedLanguage = typeof term === 'string' ? language : term.language || language;
                    const relatedWeight = typeof term === 'string' ? 0.6 : term.weight || 0.6;
                    this.addRelatedTerm(sourceNode.id, relatedWord, relatedLanguage, relatedWeight, {
                        source: 'resolver-related-term',
                    });
                });
            }

            if (sourceNode && result.morphologicalRoot) {
                this.addDerivedFrom(sourceNode.id, result.morphologicalRoot, language, 0.8, {
                    source: 'resolver-morphology',
                });
            }

            resolutions.push({
                word: token.word,
                language,
                tokenInspection: token,
                result,
            });
        }

        const resolvedOOVCount = resolutions.filter(({ result }) => Boolean(result.resolution)).length;

        return {
            text,
            language,
            targetLanguage,
            detection,
            resolutions,
            sigmaData: this.getSigmaGraphData(),
            statistics: {
                ...this.getStatistics(),
                totalTokenCount: detection.totalTokenCount,
                oovTokenCount: detection.oovTokenCount,
                oovTokenRate: detection.oovTokenRate,
                unresolvedOOVCount: detection.oovTokenCount - resolvedOOVCount,
                resolvedOOVCount,
            },
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
            morphologicalRoot: payload.morphologicalRoot || null,
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
                tokenInspection: node.metadata.tokenInspection,
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
                color: EDGE_COLORS[edge.type],
                relationGroup: edge.type,
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
        this._updateResolutionRate();

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

    _generateDomainNodeId(domain) {
        return `domain_${this._normalizeDomain(domain)}`;
    }

    _normalizeDomain(domain) {
        if (!domain || typeof domain !== 'string') {
            return SEMANTIC_DOMAINS.GENERAL;
        }

        return domain.toLowerCase().replace(/\s+/g, '_');
    }

    _findEdge(sourceId, targetId, edgeType) {
        return Array.from(this.edges.values()).find(
            edge => edge.sourceId === sourceId && edge.targetId === targetId && edge.type === edgeType
        );
    }

    _addConflictsForCompetingTranslations(sourceId, targetId, metadata = {}) {
        this.getEdgesByType(sourceId, EDGE_TYPES.TRANSLATES_TO)
            .filter(edge => edge.targetId !== targetId)
            .forEach(edge => {
                this.addSemanticRelation(
                    targetId,
                    edge.targetId,
                    EDGE_TYPES.CONFLICTS_WITH,
                    0.7,
                    {
                        reason: 'competing_translation',
                        ...metadata,
                    }
                );
            });
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
