# NLP-to-Knowledge Graph Evaluation Plan

## Overview

This document defines the metrics, test cases, and success criteria for evaluating the **Neural Machine Translation with OOV Knowledge Graph Learning** system. The evaluation measures both translation quality and graph construction effectiveness.

---

## Part 1: Evaluation Metrics

### 1.1 Translation Quality Metrics

| Metric                   | Description                                                     | Target                           | Measurement                                                         |
| ------------------------ | --------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------- |
| **BLEU Score**           | Machine translation evaluation metric (0-100, higher is better) | ≥ 28 on domain-specific test set | Compare model output against reference translations using sacrebleu |
| **OOV Rate (Reduction)** | Percentage of unknown tokens relative to baseline               | ≤ 5% on domain vocabulary        | `count(unresolved_tokens) / total_tokens × 100`                     |
| **Translation Accuracy** | Percentage of sentences with acceptable translation             | ≥ 85%                            | Manual spot-check or automated evaluation against reference corpus  |
| **Inference Time**       | Average latency per sentence translation                        | ≤ 500ms per sentence             | Profile end-to-end translation latency across test set              |

### 1.2 OOV Resolution Metrics

| Metric                        | Description                                           | Target                                                    | Measurement                                            |
| ----------------------------- | ----------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| **OOV Resolution Rate**       | Percentage of OOV tokens successfully resolved        | ≥ 75%                                                     | `resolved_tokens / detected_oov_tokens × 100`          |
| **Resolution Precision**      | Accuracy of resolved translations                     | ≥ 70%                                                     | Manual review of a random sample of 100 resolved words |
| **Resolution Recall**         | Proportion of actual OOV tokens detected              | ≥ 90%                                                     | Compare detected OOV against manual annotation         |
| **Fallback Pipeline Success** | Percentage of OOV tokens reaching each fallback stage | Context: ≥ 20%, Dictionary: ≥ 50%, Transliteration: ≥ 10% | Log distribution across resolution pipeline stages     |

### 1.3 Knowledge Graph Metrics

| Metric                           | Description                                     | Target                                   | Measurement                                                                              |
| -------------------------------- | ----------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Graph Growth Rate**            | New nodes added per 1,000 sentences             | ≥ 15 nodes/1K sentences                  | `new_nodes / (sentence_count / 1000)`                                                    |
| **Node Confidence Distribution** | Nodes transitioning from `unknown` → `verified` | Unknown underflow after processing ≥ 80% | Count nodes in each confidence state (unknown, inferred, verified)                       |
| **Graph Connectivity**           | Average degree per node (semantic richness)     | ≥ 1.8 edges/node                         | `total_edges / node_count`                                                               |
| **Edge Type Distribution**       | Balance across relation types                   | None > 60% of total edges                | Breakdown: `translates_to`, `belongs_to`, `related_to`, `derived_from`, `conflicts_with` |
| **Semantic Domain Coverage**     | Number of distinct domains represented          | ≥ 4 domains active                       | Count unique domain nodes: medical, legal, technical, slang, etc.                        |

### 1.4 Domain-Specific Metrics (Medical, Legal, Technical)

| Domain        | Key Metric                 | Target                                 | Target Value |
| ------------- | -------------------------- | -------------------------------------- | ------------ |
| **Medical**   | Domain vocabulary coverage | Recall on medical term detection       | ≥ 80%        |
| **Legal**     | Domain vocabulary coverage | Precision on legal term classification | ≥ 85%        |
| **Technical** | Domain vocabulary coverage | F1 score on tech term detection        | ≥ 0.80       |

---

## Part 2: Test Sets

### 2.1 Core Test Sets

| Test Set                      | Size            | Purpose                                | Source                                                 |
| ----------------------------- | --------------- | -------------------------------------- | ------------------------------------------------------ |
| **Baseline Vocabulary**       | 1,000 words     | Verify known words translate correctly | Standard MT corpus (e.g., WMT shared task)             |
| **OOV Challenge Set**         | 500 tokens      | Verify OOV detection and resolution    | Manually curated out-of-vocabulary words               |
| **Domain-Specific Medical**   | 200 sentences   | Evaluate domain accuracy               | Medical glossaries + clinical trial abstracts          |
| **Domain-Specific Legal**     | 200 sentences   | Evaluate domain accuracy               | Legal documents + contract language                    |
| **Domain-Specific Technical** | 200 sentences   | Evaluate domain accuracy               | Software documentation + research papers               |
| **Mixed Domain**              | 300 sentences   | Evaluate cross-domain handling         | Multi-domain corpus samples                            |
| **Semantic Consistency**      | 100 pairs       | Verify semantic relations hold         | Synonym/antonym pairs requiring consistent translation |
| **Graph Stress Test**         | 5,000 sentences | Measure scalability & growth           | Extended dataset processing                            |

### 2.2 Test Set Composition

**OOV Challenge Set Breakdown:**

- 150 tokens: Single-character morphological variants
- 100 tokens: Transliteration-heavy (loan words, proper nouns)
- 100 tokens: Context-dependent (multiple valid translations)
- 50 tokens: Brand names / technical jargon
- 100 tokens: Slang and colloquialisms

**Domain-Specific Set Breakdown (per domain):**

- 100 sentences: Single-domain terminology only
- 70 sentences: Mixed with 1-2 OOV tokens per sentence
- 30 sentences: High density OOV (4+ OOV tokens per sentence)

---

## Part 3: Passing Criteria

### 3.1 Translation Module Passes When:

- [ ] **BLEU Score ≥ 28** on domain-specific test set (medical + legal + technical combined)
- [ ] **OOV Rate ≤ 5%** measured across all test sets
- [ ] **Translation Accuracy ≥ 85%** on semantic consistency test pairs
- [ ] **Inference Time ≤ 500ms** averaged over 100 random sentences
- [ ] **No timeout errors** on stress test (5,000 sentences)

### 3.2 OOV Resolution Passes When:

- [ ] **OOV Resolution Rate ≥ 75%** across challenge set
- [ ] **Resolution Precision ≥ 70%** on manual spot-check (30 words random sample)
- [ ] **Resolution Recall ≥ 90%** vs. annotated reference
- [ ] **Fallback pipeline reaches at least 2 stages** for unresolved tokens
- [ ] **No crashes** during resolution failures (graceful fallback)

### 3.3 Knowledge Graph Passes When:

- [ ] **Graph Growth Rate ≥ 15 nodes/1K sentences** on extended dataset
- [ ] **Confidence distribution** shows ≤ 5% of nodes remain `unknown` after processing
- [ ] **Graph Connectivity ≥ 1.8 edges/node** indicating semantic richness
- [ ] **No edge type dominates** (no single type > 60% of total)
- [ ] **All 4 primary domains** represented with ≥ 5 nodes each
- [ ] **Graph integrity**: All edges reference valid existing nodes

### 3.4 Domain-Specific Passes When:

**Medical:**

- [ ] Medical vocabulary detection F1 ≥ 0.75
- [ ] Medical translation accuracy ≥ 80% on 50-word reference sample
- [ ] At least 15 medical domain nodes created during test

**Legal:**

- [ ] Legal vocabulary detection F1 ≥ 0.75
- [ ] Legal translation accuracy ≥ 80% on 50-word reference sample
- [ ] At least 15 legal domain nodes created during test

**Technical:**

- [ ] Technical vocabulary detection F1 ≥ 0.75
- [ ] Technical translation accuracy ≥ 80% on 50-word reference sample
- [ ] At least 15 technical domain nodes created during test

### 3.5 System-Level Passes When:

- [ ] **All translation module checks pass**
- [ ] **All OOV resolution checks pass**
- [ ] **All knowledge graph checks pass**
- [ ] **All domain-specific checks pass**
- [ ] **Memory footprint** does not exceed 2GB on stress test
- [ ] **Log analysis** shows no unhandled exceptions

---

## Part 4: Test Procedure

### 4.1 Setup Phase

1. Load pretrained Marian model (`Helsinki-NLP/opus-mt-en-fr`)
2. Initialize knowledge graph in clean state
3. Load all test sets from `/data/test_sets/` directory
4. Configure resolver to capture detailed metrics (domain, confidence, resolution method)

### 4.2 Execution Phase

For each test set:

1. **Pre-flight**: Verify test set integrity (no empty sentences, valid UTF-8)
2. **Translation**: Process all sentences through `/translate-sentence` endpoint
3. **Capture**: Log response metadata (BLEU, OOV rate, graph updates, latency)
4. **Measurement**: Compute per-test-set metrics
5. **Accumulation**: Aggregate results into master evaluation report

### 4.3 Validation Phase

1. **Automated checks**: Verify all numeric targets met
2. **Manual review**: Sample spot-checks for precision-dependent metrics
3. **Graph inspection**: Visualize sample subgraph to verify semantic coherence
4. **Comparison**: Compare against baseline/previous evaluation runs
5. **Report**: Document pass/fail status per criterion

---

## Part 5: Evaluation Report Template

```
# Evaluation Run: [DATE-TIME]
## Test Environment
- Model: Helsinki-NLP/opus-mt-en-fr
- Graph State: [Clean / Warm-start after X sentences]
- Test Duration: [HH:MM:SS]

## Summary
- Overall Status: [PASS / FAIL]
- Passing Criteria Met: [N of M]

## Translation Metrics
| Metric | Target | Result | Status |
|--------|--------|--------|--------|
| BLEU Score | ≥28 | [X.XX] | [✓/✗] |
| OOV Rate | ≤5% | [X.XX%] | [✓/✗] |
| ... | ... | ... | ... |

## OOV Resolution Metrics
[Similar table]

## Knowledge Graph Metrics
[Similar table]

## Domain-Specific Results
[Medical/Legal/Technical tables]

## Failures & Issues
- [Issue 1]: [Description, root cause, action]
- [Issue 2]: [Description, root cause, action]

## Recommendations
- [Recommendation 1]
- [Recommendation 2]

## Next Steps
- [ ] Investigate [specific failure]
- [ ] Rerun with [specific config]
```

---

## Part 6: Automated Test Scripts

Tests should be automated using:

- **`smoke-test.js`**: Daily quick sanity check (100 sentences, all metrics)
- **`integration-test.py`**: Weekly full evaluation (all test sets)
- **CI/CD hooks**: Run smoke tests on every commit, full eval on PR merge

### Smoke Test Checklist

- [ ] Translation completes without errors
- [ ] Graph nodes are created
- [ ] OOV detection triggers on challenge words
- [ ] No memory leaks over 100-sentence run

### Full Evaluation Checklist

- [ ] All test sets processed
- [ ] All metrics calculated and logged
- [ ] Comparison against baseline performed
- [ ] Report generated and archived

---

## Part 7: Success Interpretation

| Outcome                            | Interpretation                                    | Action                                            |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| **All pass**                       | System meets quality bar                          | Approve for deployment / next milestone           |
| **Translation fails, others pass** | Model needs retraining or better inference tuning | Investigate BLEU regression, data quality         |
| **OOV resolution fails**           | Fallback pipeline needs improvement               | Review resolver precision, add more dictionaries  |
| **Graph fails**                    | Schema or merge logic issues                      | Debug edge creation and node deduplication        |
| **Domain-specific fails**          | Vocabulary gaps in that domain                    | Add domain glossaries, retrain semantic relations |

---

## Timeline & Frequency

- **Smoke Tests**: Every commit (automated)
- **Full Evaluation**: Weekly or before release (manual trigger)
- **Baseline Reset**: Monthly (clean graph, fresh run)
- **Continuous Monitoring**: Log key metrics from production usage

---

## Maintenance

Update this plan when:

- New domains are added
- Model architecture changes
- Test sets are refreshed or expanded
- Passing criteria are adjusted based on requirements
