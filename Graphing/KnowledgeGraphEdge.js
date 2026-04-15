class KnowledgeGraphEdge {
    constructor(sourceId, targetId, type, weight = 0.5) {
        this.sourceId = sourceId;
        this.targetId = targetId;
        this.type = type;
        this.weight = Math.max(0, Math.min(1, weight));
        this.createdAt = new Date();
        this.metadata = {};
    }
}

module.exports = KnowledgeGraphEdge;
