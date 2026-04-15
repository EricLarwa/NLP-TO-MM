const EDGE_TYPES = {
    TRANSLATES_TO: 'translates_to',
    BELONGS_TO: 'belongs_to',
    RELATED_TO: 'related_to',
    DERIVED_FROM: 'derived_from',
    CONFLICTS_WITH: 'conflicts_with',
};

const CONFIDENCE_STATES = {
    UNKNOWN: 'unknown',
    INFERRED: 'inferred',
    VERIFIED: 'verified',
};

const SEMANTIC_DOMAINS = {
    MEDICAL: 'medical',
    LEGAL: 'legal',
    TECHNICAL: 'technical',
    GENERAL: 'general',
    PROPER_NOUN: 'proper_noun',
    SLANG: 'slang',
};

const RESOLUTION_STAGES = {
    CONTEXT_INFERENCE: 'context_inference',
    DICTIONARY_LOOKUP: 'dictionary_lookup',
    TRANSLITERATION: 'transliteration',
    MANUAL_REVIEW: 'manual_review',
};

module.exports = {
    EDGE_TYPES,
    CONFIDENCE_STATES,
    SEMANTIC_DOMAINS,
    RESOLUTION_STAGES,
};
