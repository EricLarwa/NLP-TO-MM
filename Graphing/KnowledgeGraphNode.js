const { CONFIDENCE_STATES, SEMANTIC_DOMAINS } = require('./constants');

class KnowledgeGraphNode {
  constructor(id, word, language, domain = SEMANTIC_DOMAINS.GENERAL) {
    this.id = id;
    this.word = word;
    this.language = language;
    this.domain = domain;
    this.confidenceStatus = CONFIDENCE_STATES.UNKNOWN;
    this.createdAt = new Date();
    this.lastUpdated = new Date();
    this.resolutionPath = [];
    this.occurrenceCount = 1;
    this.metadata = {
      partOfSpeech: null,
      morphologicalRoot: null,
      contextExamples: [],
    };
  }

  markResolved(stage, confidence, translation = null) {
    this.confidenceStatus = confidence;
    this.resolutionPath.push({
      stage,
      timestamp: new Date(),
      resultingTranslation: translation,
    });
    this.lastUpdated = new Date();
  }

  recordOccurrence(context = null) {
    this.occurrenceCount += 1;
    if (context && this.metadata.contextExamples.length < 10) {
      this.metadata.contextExamples.push({
        context,
        timestamp: new Date(),
      });
    }
  }
}

module.exports = KnowledgeGraphNode;
