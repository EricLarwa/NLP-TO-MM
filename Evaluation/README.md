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

The included sample is intentionally small and OOV-heavy. It includes relaxed `targets` in the JSON file so it can demonstrate a passing evaluator run. Larger benchmark files can omit `targets` to use the default production-style thresholds from `evaluator.js`, or provide their own target block.

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

The top-level JSON object can include:

- `name`: label shown in the report.
- `targets`: optional metric thresholds for that specific evaluation set.

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
