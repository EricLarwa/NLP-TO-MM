
A neural machine translation system that handles unknown vocabulary by learning from it. When the model encounters a word it doesn't recognizeit attempts to resolve it and stores the result in a growing knowledge graph. The more it's used, the more it knows.


## What It Does

- Translates text between languages using a pretrained NLP model
- Detects out-of-vocabulary (OOV) words at inference time
- Routes unknown words through a fallback resolution pipeline
- Stores resolved words as nodes in a knowledge graph with semantic relationships
- Visualizes the graph so you can see what the system knows and where gaps still exist


## Project Structure

```

├── data/               # Corpora, glossaries, and test sets
├── graph/              # Knowledge graph logic and schema
├── pipeline/           # OOV detection and resolution
├── translation/        # Core translation model interface
├── visualization/      # Graph rendering and inspection tools
├── tests/              # Test cases and evaluation sets
└── docs/               # Design decisions, schema docs, meeting notes
```



## Knowledge Graph

Each word the system learns becomes a node. Nodes connect to each other through typed edges:

| Edge | Meaning |
|---|---|
| `translates_to` | Source word → target translation |
| `belongs_to` | Word → semantic domain (e.g. medical, legal) |
| `related_to` | Semantic neighbors |
| `derived_from` | Morphological root relationship |
| `conflicts_with` | Two competing translations for the same word |

Nodes carry a confidence status: `unknown` → `inferred` → `verified`


## OOV Resolution Pipeline

When an unknown word is detected:

1. Context inference — can meaning be guessed from surrounding words?
2. Dictionary/API lookup — check external sources for a known translation
3. Transliteration — character-level fallback for proper nouns
4. Flag for manual review — logged as an unresolved node in the graph



## Evaluation

Success is measured by:

- Reduction in unresolved token rate vs. baseline model
- BLEU score on a domain-specific test set
- F1 score on a held-out set of known OOV words
- Knowledge graph growth rate per 1,000 sentences processed


## Contributing

Implementation is in early stages. Contributions are welcome! Please check the project board for open issues and ongoing work before starting new contributions.

All issues are tracked on the project board. Check there before starting new work.


## Status

Early development. Core translation interface and OOV detection pipeline are in progress.

