# Changes

## OOV Handling

- Added tokenizer-level OOV inspection in `Model_Import.py` using Marian tokenizer pieces and unknown-token IDs.
- Added `/detect-oov` to return inspected tokens, OOV-only tokens, OOV counts, and OOV rate.
- Updated `/translate-sentence` to translate the full sentence while routing only detected OOV tokens through fallback resolution.
- Added `detectOOVWords()` to `Graphing/NLPKnowledgeGraph.js` for JavaScript access to resolver-side OOV detection.
- Added `resolveOOVText()` to detect OOV tokens, resolve only those tokens, store token inspection metadata on graph nodes, and create translation edges for resolved OOV terms.
- Updated live visualization data generation to use the graph-level OOV workflow for custom input text.
- Updated the visualization status line to show OOV counts and rate when available.

## Semantic Relations

- Added graph helpers for semantic domain membership, related terms, morphological roots, translations, and competing-translation conflicts.
- Added domain nodes so `belongs_to` edges can connect words to explicit semantic-domain graph nodes.
- Added duplicate-edge merging so repeated semantic relation inserts update weight and metadata instead of creating parallel duplicates.
- Preserved resolver-provided `domain` and `relatedTerms` values from OOV resolution results and convert them into `belongs_to` and `related_to` graph edges.
- Added relation grouping and per-relation colors to Sigma graph edge attributes for later visualization filtering.
- Updated sample graph generation to include `belongs_to`, `related_to`, `derived_from`, `translates_to`, and `conflicts_with` examples.
- Regenerated `Graphing/sample-graph.json` with semantic relation examples and corrected statistics refresh before reporting.
