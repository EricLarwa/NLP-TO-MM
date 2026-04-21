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
- Kept resolver-provided `domain` and `relatedTerms` values from OOV resolution results and convert them into `belongs_to` and `related_to` graph edges.
- Added relation grouping and per-relation colors to Sigma graph edge attributes for later visualization filtering.
- Updated sample graph generation to include `belongs_to`, `related_to`, `derived_from`, `translates_to`, and `conflicts_with` examples.
- Regenerated `Graphing/sample-graph.json` with semantic relation examples and corrected statistics refresh before reporting.
- Added resolver-side semantic enrichment for coarse domains, related terms, and simple morphological roots.
- Updated Python-generated Sigma payloads so direct `/translate-sentence` responses include semantic relation groups, relation colors, domain nodes, related-term edges, and derived-root edges.
- Wired resolver `morphologicalRoot` values into `Graphing/NLPKnowledgeGraph.js` so OOV graph resolution can create `derived_from` edges.
- Returned semantic metadata in `/translate-sentence` resolution summaries and constrained root inference to avoid noisy roots like `computer -> comput`.

## Evaluation

- Added `Evaluation/evaluator.js` for dependency-light automated evaluation of BLEU-style translation quality, OOV detection precision/recall/F1, OOV resolution metrics, graph growth, graph connectivity, edge-type distribution, domain coverage, and graph integrity.
- Added unresolved-token rate reduction support when evaluation records include a baseline unresolved/OOV rate.
- Added `Evaluation/sample-evaluation-set.json` as an example input file and `Evaluation/README.md` with the evaluation schema and run commands.
- Added optional JSON report output to `Evaluation/evaluator.js` for archiving evaluation results.

## Visualization Fixes

- Added model API discovery for the Resolve button so the browser checks `/health` before posting to `/translate-sentence`.
- Added support for `?api=http://127.0.0.1:<port>` in `Graphing/visualization-demo.html` to avoid static-server and model-server port collisions.
- Wrapped Sigma initialization so wheel listeners attached to the graph container default to passive listeners and avoid Chrome scroll-blocking warnings.
- Added a Resolve result strip showing the model translation, detected OOV tokens, and resolved OOV outputs.
- Added an explicit no-OOV status message for successful Resolve calls that do not add graph nodes.
