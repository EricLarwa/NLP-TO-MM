# Evaluation

Run the local evaluation scaffold with:

```bash
node Evaluation/evaluator.js
```

Pass a custom JSON file when evaluating a generated test set:

```bash
node Evaluation/evaluator.js path/to/evaluation-records.json
```

Write an archived JSON report by passing a second path:

```bash
node Evaluation/evaluator.js path/to/evaluation-records.json path/to/report.json
```

The included sample is intentionally small and OOV-heavy, so it demonstrates metric calculation but is not expected to pass every production target.

## Input Shape

The evaluator accepts either an array of records or an object with a `records` array.

Each record can include:

- `source`: source sentence.
- `reference`: expected sentence translation.
- `prediction` or `translation`: model output to compare against `reference`.
- `expectedOOV`: manually annotated OOV words.
- `detectedOOV`, `tokens`, or `oovTokens`: OOV detector output.
- `expectedTranslations`: map of OOV word to expected translation.
- `resolutions`: resolved OOV terms with `word`, `translation`, and `success`.
- `sigmaData`: graph payload with `nodes` and `edges`.
- `baselineUnresolvedTokenRate`: baseline unresolved/OOV rate for reduction comparisons.

## Metrics

The script reports:

- BLEU-style corpus score.
- OOV detection precision, recall, F1, and token rate.
- Unresolved-token rate reduction when a baseline is supplied.
- OOV resolution rate, precision, and F1.
- Graph growth rate per 1,000 sentences.
- Graph connectivity.
- Confidence, edge-type, and domain distributions.
- Graph integrity for dangling edge references.
