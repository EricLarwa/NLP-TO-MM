# Git Workflow

This document outlines how we manage branches, commits, pull requests, and code review as a team. Everyone is expected to follow this — it keeps the project clean and makes collaboration easier.


## Branches

We use a simple branching structure:

```
main          → stable, working code only. never commit directly here.
dev           → active development branch. all features merge here first.
feature/xxx   → individual features or tasks
fix/xxx       → bug fixes
docs/xxx      → documentation updates
data/xxx      → data collection, cleaning, or labeling work
research/xxx  → findings, comparisons, design decisions
```

**Examples:**
```
feature/oov-detection
fix/graph-duplicate-nodes
docs/update-readme
data/clean-medical-glossary
research/corpus-comparison
```


## Day-to-Day Workflow

### 1. Always start from dev

```
git checkout dev
git pull origin dev
```

### 2. Create your branch

```
git checkout -b feature/your-task-name
```

### 3. Make your changes, then commit

```
git add .
git commit -m "short description of what you did"
```

### 4. Push your branch

```
git push origin feature/your-task-name
```

### 5. Open a pull request into dev

Go to GitHub, open a PR from your branch into `dev`. Fill out the PR template before requesting review.

---

## Commit Messages

Keep them short and descriptive. Write them in present tense.

| Good | Bad |
|---|---|
| `add OOV detection logic` | `stuff` |
| `fix duplicate node on graph insert` | `fixed it` |
| `update README with graph schema` | `changes` |
| `clean medical glossary dataset` | `working on data` |

If the commit closes an issue, add it at the end:

```
add OOV resolution fallback layer  #12
```

---

## Pull Requests

Before opening a PR, make sure:

- [ ] Your branch is up to date with `dev`
- [ ] You've tested or reviewed your own changes
- [ ] The PR title clearly describes what changed
- [ ] You've linked the relevant issue if one exists
- [ ] You haven't committed any API keys, credentials, or large data files

Every PR needs at least **one reviewer** before merging. The author should not merge their own PR.

---

## Code Review

When reviewing a PR you're looking for:

- Does it do what the description says?
- Is anything unclear or undocumented?
- Does it introduce anything that could break existing work?
- Are variable names, file names, and structure consistent with the rest of the project?

Leave clear, constructive comments. Approve when it's ready.

---

## Merging

- **dev → main** is done after testing
- **feature branches → dev** are merged via PR after review
- Delete your branch after it's merged — keep the repo clean


## What Lives in the Repo

| Include | Do Not Include |
|---|---|
| Source code | API keys or credentials |
| Documentation and notes | Large raw data files |
| Test cases and eval sets | Personal environment files (.env, venv) |
| Cleaned / labeled data samples | Model weights or binaries |
| Meeting notes and research docs | OS files (.DS_Store, Thumbs.db) |

Add a `.gitignore` at the root to handle this automatically.


## Issues and the Project Board

- Every piece of work should have an issue
- Assign yourself before starting work so there's no overlap
- Move cards across the board as you progress: **Backlog → In Progress → In Review → Done**
- If something is blocked, say so in the issue comments — don't leave it silent



## Quick Reference

```
git checkout dev                        start from dev
git pull origin dev                     get latest changes
git checkout -b feature/task-name       create your branch
git add . && git commit -m "message"    commit your work
git push origin feature/task-name       push to remote
```

Then open a PR on GitHub into `dev`.