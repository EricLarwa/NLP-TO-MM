const KnowledgeGraphNode = require('./KnowledgeGraphNode');
const KnowledgeGraphEdge = require('./KnowledgeGraphEdge');
const {
  EDGE_TYPES,
  CONFIDENCE_STATES,
  SEMANTIC_DOMAINS,
  RESOLUTION_STAGES,
} = require('./constants');

class NLPKnowledgeGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.edgeIndex = 0;
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

  addEdge(sourceId, targetId, edgeType, weight = 0.5) {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);

    if (!source || !target) {
      console.warn('Cannot create edge: source or target node not found');
      return null;
    }

    const edgeId = `edge_${this.edgeIndex++}`;
    const edge = new KnowledgeGraphEdge(sourceId, targetId, edgeType, weight);
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

    let result = await this._contextInference(word, sourceContext);
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

  async _contextInference(word, context) {
    // TODO: Implement context-based inference logic using NLP techniques
    return { success: false };
  }

  async _dictionaryLookup(word, targetLanguage) {
    // TODO: Implement dictionary lookup logic
    return { success: false };
  }

  async _transliteration(word, language) {
    // TODO: Implement transliteration logic
    return { success: false };
  }

  getSigmaGraphData() {
    return this.sigmaGraphData;
  }

  _addNodeToSigmaGraph(node) {
    const colorMap = {
      [CONFIDENCE_STATES.UNKNOWN]: '#FF6B6B',
      [CONFIDENCE_STATES.INFERRED]: '#FFA726',
      [CONFIDENCE_STATES.VERIFIED]: '#66BB6A',
    };

    this.sigmaGraphData.nodes.push({
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
    });
  }

  _addEdgeToSigmaGraph(edgeId, edge) {
    this.sigmaGraphData.edges.push({
      key: edgeId,
      source: edge.sourceId,
      target: edge.targetId,
      label: edge.type,
      weight: edge.weight,
      attributes: {
        type: edge.type,
      },
    });
  }

  _updateResolutionRate() {
    const total = this.statistics.resolvedNodes + this.statistics.unresolvedNodes;
    if (total > 0) {
      this.statistics.resolutionSuccessRate = (
        (this.statistics.resolvedNodes / total) * 100
      ).toFixed(2);
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
      edges: Array.from(this.edges.values()),
      statistics: this.statistics,
      exportedAt: new Date(),
    };
  }

  importGraph(data) {
    // TODO: Implement graph import logic to reconstruct nodes, edges, and statistics from exported data
    console.log('Graph import not yet implemented');
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
