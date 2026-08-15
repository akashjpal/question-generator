# Topic Handling — question-worker Design

## Scope

`topic` is optional in practice ("just make questions from this PDF" is a
legitimate request) but nothing at the API layer enforces that it's ever
sent. This document formalizes how `question-worker` — the current
LangGraph-based worker — handles that absence across its full pipeline.

Unlike a normal design doc, this one is written **retroactively**: the
behavior described below already exists in the code, independently arrived
at from (and cleaner than) the equivalent design written earlier for the old
worker (`no_topic_fallback_implementation_plan.md`, for
`question-generator-worker`, never implemented — see "Relationship to the
old worker's design" below). The purpose here is to (1) confirm the current
behavior is intentional and correct, not accidental, and (2) name the one
real gap found while verifying it: missing test coverage for two specific
prompt fallbacks.

## Current behavior

Four stages, each independently guarding against an absent topic:

### 1. Normalization — `src/models/job.py:40-42`

```python
@field_validator("topic", mode="before")
def _blank_topic_to_none(cls, value):
    return None if isinstance(value, str) and not value.strip() else value
```

A single Pydantic validator collapses `None`, `""`, and whitespace-only
strings into one canonical `None` at the model boundary. Every downstream
consumer of `job.topic` can rely on a plain `if job.topic:` check — no
consumer needs to re-normalize.

### 2. Embeddings — `src/graph/nodes/chunk_embed.py:23`

```python
texts_to_embed = [job.topic, *chunks] if job.topic else list(chunks)
```

When topic is absent, it's never included in the embeddings request —
`topic_embedding` comes back `None` without an extra branch or a wasted/
failing API call.

### 3. Chunk selection — `src/graph/nodes/select_chunks.py:37-41`

```python
if job.topic and state.get("topic_embedding") is not None:
    ranked = _rank_by_similarity(...)
    selected_ids = sorted(int(i) for i in ranked[:k])
else:
    selected_ids = _spread_indices(len(chunks), k)
```

`_spread_indices` (same file, lines 17-24) samples `k` chunks evenly across
the *entire* document (`round(i * (total-1) / (k-1))` for `i in range(k)`),
not just the first `k`. Guards `k >= total` (take everything) and `k <= 1`
(single chunk) so it never produces duplicate or out-of-range indices.

### 4. Prompts — `src/graph/nodes/generate.py:74` and `judge.py:52`

```python
# generate.py
topic=job.topic or "(no specific topic — cover the document broadly)",

# judge.py
topic=job.topic or "(none specified — judge topic_relevant=true by default)",
```

The literal string `"None"` never reaches either LLM call. The judge prompt
additionally instructs the model directly — `topic_relevant: is it relevant
to the topic (true by default if no topic was given)?` — so a missing topic
can't cause every candidate to be rejected for failing to match one.

## Design rationale

- **One normalization point, not four.** The old worker's plan normalized
  at four separate call sites because its functions could be invoked
  directly (and are, in tests) without going through a shared entry point.
  `question-worker` avoids that by normalizing once, in the Pydantic model
  itself — every node reads `job.topic` from the same validated object, so
  there's no seam where a raw, un-normalized value could leak in.
- **Even sampling over first-k**, same reasoning as the old plan: taking the
  first `k` chunks would make a long document effectively "read" only from
  its opening pages when there's no topic to rank against — the exact
  failure mode chunking was introduced to avoid, just relocated to the
  no-topic path.
- **Inline fallback string over branching prompt templates.** The old plan
  built a structurally different judge prompt when topic was absent
  (dropping the whole `TOPIC:` line and renumbering rejection criteria).
  `question-worker` instead keeps one prompt template and swaps in a
  fallback phrase, telling the judge model directly how to score
  `topic_relevant` when none was given. Fewer code paths, same outcome.

## Test coverage

Verified present:
- `tests/test_nodes/test_chunk_embed.py::test_chunk_embed_without_topic_skips_topic_embedding`
- `tests/test_nodes/test_select_chunks.py::test_select_chunks_spreads_evenly_when_no_topic`
- `tests/test_graph.py` — multiple full-graph runs with `topic=None`

**Gap found:** neither `tests/test_nodes/test_generate.py` nor
`tests/test_nodes/test_judge.py` ever constructs a job with `topic=None` —
every test uses the default topic (`"Photosynthesis"`, from
`tests/conftest.py`'s `make_job()`). The fallback phrasing in
`generate.py:74` and `judge.py:52` is real, correct code, but nothing
asserts it — a future edit could reintroduce a literal `"None"` into either
prompt and no test would catch it. The full-graph tests in `test_graph.py`
don't close this gap either, since they run against a `ScriptedLLM` that
returns canned responses regardless of prompt content.

**Recommended follow-up (not blocking, test-only):** add one test per node
asserting the prompt sent to the LLM, for a `topic=None` job, contains
neither the literal substring `"None"` nor an empty `topic=""` interpolation,
and does contain the intended fallback phrase.

## Relationship to the old worker's design

`no_topic_fallback_implementation_plan.md` designed the same fallback for
`question-generator-worker` (the retired Python worker) but was never
implemented — grepping that worker's `helpers/` for the described
normalization pattern finds nothing. Since the project has shifted to
`question-worker`, that gap is moot as long as `question-generator-worker`
stays out of service. If it's ever reactivated, its no-topic path still
hard-fails (long docs, embeddings 400) or produces a judge that rejects
everything for being "about None" (short docs) — flagged for awareness, not
addressed here.

## Out of scope (re-affirmed for question-worker)

Same exclusions as the old worker's plan, and for the same reasons:
- **Making `topic` required** — would remove the legitimate "questions from
  this PDF" use case.
- **Inferring a topic via an extra LLM call** — adds latency, cost, and a
  new failure mode to solve a problem the fallback already solves for free.
- **Snapping chunk boundaries to whitespace** — unrelated to topic handling,
  not revisited here.
