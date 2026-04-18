# Changes

## OOV Handling

- Added tokenizer-level OOV inspection in `Model_Import.py` using Marian tokenizer pieces and unknown-token IDs.
- Added `/detect-oov` to return inspected tokens, OOV-only tokens, OOV counts, and OOV rate.
- Updated `/translate-sentence` to translate the full sentence while routing only detected OOV tokens through fallback resolution.
- Added `detectOOVWords()` to `Graphing/NLPKnowledgeGraph.js` for JavaScript access to resolver-side OOV detection.
- Added `resolveOOVText()` to detect OOV tokens, resolve only those tokens, store token inspection metadata on graph nodes, and create translation edges for resolved OOV terms.
- Updated live visualization data generation to use the graph-level OOV workflow for custom input text.
- Updated the visualization status line to show OOV counts and rate when available.
