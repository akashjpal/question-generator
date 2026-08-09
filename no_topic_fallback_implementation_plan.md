# No-Topic Fallback — Implementation Plan

## Problem

`topic` is optional in practice but treated as mandatory by the code.

`question-generator-api-ts/index.ts:57` destructures `topic` straight out of
`req.body` with no validation and no default. If a caller omits it, the key
disappears from the SQS payload, `helpers/receiver.py` resolves
`job.get("topic")` to `None`, and that `None` flows all the way into the
generation pipeline.

Two distinct failure modes result:

| Situation | What happens today |
|---|---|
| No topic + **short** doc (≤ k chunks) | Survives by luck — `topic` is never read on the short-circuit path. But the generation prompt then literally reads `about "None"`, and the judge is told `TOPIC: "None"`, so it may reject every candidate for being "off-topic" and end in `RuntimeError` after 5 rounds |
| No topic + **long** doc (> k chunks) | **Hard failure.** `rank_chunks_by_topic` sends `input=[None, *chunks]` to the embeddings API → HTTP 400. Nothing catches it locally, so the job fails, retries 3×, and lands in `STATUS_FAILED` |

Today's Angular client always sends a topic (`assessment.service.ts:37`), so
this is not currently firing in production. But nothing enforces it, and
`ai-agent-chatbot` is a second caller of the same endpoint.

## Decision

**Graceful fallback**, not "make topic required" and not "infer a topic with
an extra LLM call." A document on its own is a legitimate input — "just make
questions from this PDF" is a real use case — so the pipeline should degrade
cleanly rather than reject the request or invent a topic.

Scope note: this change touches **only the Python worker**. No TypeScript API
change, no database migration, no frontend change.

## Design

### 1. Normalise every "absent" spelling to `None`

```python
topic = (topic or "").strip() or None
```

This collapses `None`, `""`, and `"   "` into one canonical value.

Apply it in **four** places: `generate_questions_with_llm` (the pipeline entry
point), `select_relevant_text`, `build_generation_prompt`, and
`build_judge_prompt`. Each then guards with a plain `if topic:`.

Normalising only at the entry point would be insufficient, and subtly so: a
bare `if topic:` treats `"   "` as *present* (a non-empty string is truthy), so
any of the three downstream functions called directly — which is exactly how
they are unit-tested — would still try to rank against, or interpolate, a
whitespace-only topic. Repeating a one-line expression is the right trade here
against introducing a shared module for it; each function stays correct in
isolation, which is the property its tests depend on.

### 2. `helpers/chunking.py` — `select_relevant_text`

With no topic there is nothing to rank against, so the embeddings call is
skipped entirely and chunks are selected **positionally**.

Selection is **evenly spaced across the whole document**, not the first k:

```python
indices = [round(i * (len(chunks) - 1) / (k - 1)) for i in range(k)]
```

For 20 chunks with k=5 that yields chunks 0, 5, 10, 14, 19 — both ends
included, coverage across the whole document. Chunks are joined in document
order.

Rationale for even sampling over first-k: taking the first k chunks would mean
a 40-page PDF is read only from the front, recreating the exact
"only the beginning of the document matters" bug this whole chunking module
was built to fix — just relocated to the no-topic path.

Guard — why `k - 1` is never zero. In general `k = min(len(chunks), desired)`
where `desired = max(3, min(10, ceil(n/2)))`, so `k` *can* fall below 3 (a
2-chunk document gives `k = 2`). But this branch is only reached when
`len(chunks) > k`, which forces `k == desired`, and `desired >= 3` by its
floor. So `k >= 3` and `k - 1 >= 2` here specifically. Spacing
`(len-1)/(k-1)` is therefore always greater than 1 in this branch, making the
rounded indices strictly increasing — no collisions, always exactly `k` chunks.

The existing short-circuit (`len(chunks) <= k` → use everything, no embeddings)
is unchanged and takes precedence, exactly as it does today.

### 3. `helpers/qgen_graph/prompts.py` — `build_generation_prompt`

Topic-agnostic TASK line when `topic` is `None`:

- With topic (unchanged):
  `TASK: Generate exactly {n} unique multiple-choice questions about "{topic}" at "{difficulty}" difficulty.`
- Without topic:
  `TASK: Generate exactly {n} unique multiple-choice questions covering the key concepts in the CONTENT above, at "{difficulty}" difficulty.`

The literal string `None` must never reach the model.

### 4. `helpers/qgen_graph/prompts.py` — `build_judge_prompt`

When `topic` is `None`:

- Omit the `TOPIC: "{topic}"` line entirely.
- Remove rejection criterion 1 ("It is not genuinely about the topic …") and
  renumber the remaining criteria.

The judge continues to enforce difficulty fit, semantic duplication against
already-accepted questions, and semantic duplication against earlier
candidates in the same batch. Only the topic-relevance check is dropped —
because with no topic supplied there is no relevance question to answer, and
leaving it in is precisely what would make the judge reject everything for
failing to be about `"None"`.

### 5. What does not change

- All existing behaviour when a topic **is** supplied — identical prompts,
  identical ranking, identical results.
- `pipeline.py`, `receiver.py`, `consumer.py`, `save_questions_to_db`.
- The API, the database schema, and the frontend.

## Error handling

Nothing new can fail. The no-topic path strictly *removes* a network call
(the embeddings request) rather than adding one, so it has fewer failure modes
than the topic path, not more. Existing terminal semantics are untouched:
empty `collected` after all rounds still raises `RuntimeError`; a short but
non-empty result still logs a warning and returns.

## Testing

TDD, reusing the existing fakes and conventions in `tests/test_chunking.py`
and `tests/test_qgen_graph.py` — no mocking libraries, no real network calls.

- Long doc (> k chunks) + `topic=None` → returns k evenly-spaced chunks joined
  in document order, and the embeddings client is **never** invoked (reuse the
  existing `RaisingEmbeddingsClient`, whose `.embeddings.create` raises).
- `topic=""` and `topic="   "` behave identically to `topic=None` — asserted
  against `select_relevant_text` and both prompt builders **called directly**,
  not only through `generate_questions_with_llm`. The whitespace-only case is
  the one that regresses if normalisation is centralised at the entry point
  alone, so it needs coverage at each seam.
- Even-sampling index selection is correct for a known case (20 chunks, k=5 →
  first and last chunk both present).
- Short doc (≤ k chunks) + `topic=None` → unchanged short-circuit, all chunks
  returned, no embeddings call.
- `build_generation_prompt(topic=None)` → output contains neither the literal
  `None` nor `about ""`, and contains the topic-agnostic phrasing.
- `build_judge_prompt(topic=None)` → no `TOPIC:` line, no literal `None`, and
  no topic-relevance rejection criterion; difficulty and duplicate criteria
  still present.
- `run_generation` completes end-to-end with `topic=None` against `FakeLLM`.
- Regression: every existing with-topic test passes unchanged.

## Out of scope

- **Making `topic` required at the API** — considered and rejected in favour of
  the fallback; would remove the "questions from this PDF" use case.
- **Inferring a topic from the document** via an extra LLM call — adds latency,
  cost, and a failure mode to solve a problem the fallback already solves.
- **Snapping chunk boundaries to whitespace** — raised and explicitly declined.
  Chunks are cut at raw character positions and can split mid-word; the 12%
  overlap means no content is lost, and the effect on a 5,200-character
  embedding is negligible.
- **Join order on the topic path** — noted, not changed:
  `rank_chunks_by_topic` returns chunks most-relevant-first, and
  `select_relevant_text` joins them in that relevance order, so the text handed
  to the LLM is not in document order. This is pre-existing behaviour, unrelated
  to the no-topic bug, and changing it is a separate decision.
- **Performance** — still deferred, per the LangGraph plan.
