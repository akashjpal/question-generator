# LangGraph Question Generation — Implementation Plan

## Problem

`question-generator-worker/helpers/question_generator.py`'s
`generate_questions_with_llm` has two separate gaps today:

1. **No real quality check.** It's a flat retry loop: call the LLM,
   structurally validate (4 options, valid answer letter), MD5-dedupe
   exact-text repeats, repeat up to 3x if short. Nothing checks that a
   question is actually relevant to the requested topic, that its reasoning
   depth matches the requested difficulty, or that it isn't a reworded
   repeat of one already generated (MD5 only catches byte-identical text).
2. **No real document coverage.** `_compact_source_text()` hard-truncates
   the extracted PDF text to 4,500 characters — roughly one page — and
   silently discards everything after that, regardless of how long the
   document actually is or where the relevant content sits in it.

## The whole process, in one diagram

```
 PDF bytes
    │
    ▼
 extract_text_from_pdf()  ─────────────────────────────  unchanged
    │  full document text
    ▼
┌───────────────────────────────────────────────────┐
│  NEW — chunk_and_select_relevant_text()             │
│                                                       │
│   1. split text into overlapping windows              │
│   2. embed every chunk + the topic (one batch call)     │
│   3. rank chunks by similarity to the topic              │
│   4. keep only the top-k chunks                            │
│      (skip steps 2–4 entirely if the doc is already        │
│       small enough that "top-k" would be "all of it")       │
└───────────────────────────────────────────────────┘
    │  curated source_text (on-topic, fits comfortably in context)
    ▼
┌───────────────────────────────────────────────────┐
│  NEW — LangGraph generate ⇄ judge loop                │
│                                                        │
│        ┌────────────┐         ┌───────────┐            │
│  ┌────▶│  generate   │ ──────▶│   judge    │            │
│  │     │    node     │        │   node     │            │
│  │     └────────────┘         └─────┬─────┘             │
│  │                                   │                   │
│  │   still short of target,         enough questions,    │
│  └───  round < 5  ────────────      or round == 5         │
│                                   │                        │
└───────────────────────────────────┼────────────────────────┘
                                     ▼
                          final question list
                                     │
                                     ▼
                     save_questions_to_db()  ──── unchanged
```

## In simple words

Today the worker reads only the first page or so of whatever PDF gets
uploaded, asks the AI for questions once, checks that the AI's answer is
*shaped* like valid multiple-choice questions (right number of options, a
real answer letter), and calls it done — with no check that the questions
are actually good, on-topic, or unique in meaning, and no way to use content
past page one.

This plan fixes both problems with two new stages that slot in before and
after the part of the pipeline that already exists:

**Stage 1 — find the right part of the document.** Instead of blindly
taking the first 4,500 characters, the document gets split into overlapping
chunks, each chunk gets compared against the requested topic (using
embeddings — a way of turning text into numbers so "how similar are these
two pieces of text" becomes a simple calculation), and only the chunks that
are actually relevant to the topic get used. For a short document this step
barely does anything (there's nothing to filter out); for a long document
it means questions can be generated from *any* relevant part of it, not just
the beginning.

**Stage 2 — generate, then check the work.** The AI writes a batch of
candidate questions (same prompt logic as today). A second AI call — the
"judge" — reviews that batch and rejects anything that's off-topic, too easy
or too hard for the requested difficulty, or a reworded repeat of a question
already accepted. Only what survives the judge gets kept. If too few
survive, the loop asks for exactly the shortfall and tries again, up to 5
times total, before settling for whatever passed.

## Decision summary (from brainstorming)

| Question | Decision |
|---|---|
| How to check topic/difficulty fit? | LLM-as-judge node — a second LLM call reviews each candidate |
| How to check uniqueness (incl. paraphrases)? | Judge reads candidate text + already-collected text directly — no embeddings, no vector DB, no Bloom filter for *this* check (see below) |
| Keep the existing MD5 exact-dedup? | Yes — kept as a free, deterministic pre-filter under the probabilistic judge |
| On partial rejection, regenerate all or just the shortfall? | Just the shortfall |
| Max generate→judge rounds? | 5 (raised from today's 3) |
| How to handle documents longer than one page? | Chunk + embed + rank by similarity to `topic`, keep top-k chunks |
| Chunking method? | Fixed-size token windows with ~10–15% overlap |
| How many chunks to keep? | Fixed top-k, `k` derived from `target_count` (roughly `ceil(target_count / 2–3)`, clamped to a sane range) |
| Embeddings source? | OpenRouter's embeddings endpoint — reuses the existing `OPENROUTER_API_KEY`, no new secret |
| Scope of the rewrite? | Only the generation step. `pipeline.py`, `receiver.py`, `consumer.py` are untouched. |

### Why embeddings for chunk-selection but not for duplicate-detection

These look like the same tool but they're solving different-shaped problems.
Duplicate-detection compares a handful of short questions (~50–100 across a
whole job) that all fit in one prompt — the judge can just read them
directly, so embeddings would add a dependency without adding capability.
Chunk-selection is the opposite: potentially dozens of chunks from a long
document, and deciding "which of these is actually about the requested
topic" is a genuine semantic-search problem — exactly what embeddings are
for. It also composes safely with the judge already in the design: if
chunk-selection picks a slightly-off chunk, the judge downstream rejects the
off-topic candidates it produces, so imperfect retrieval degrades into "a
few more rounds needed," never silently bad output. Vector *databases*,
MinHash, and Bloom filters remain rejected everywhere in this design — the
corpus sizes involved (tens of questions, tens of chunks) never approach the
scale where those tools' overhead pays for itself; see prior discussion.

## Components

### `question-generator-worker/helpers/chunking.py` (new)

- `chunk_text(text, window_tokens≈1200-1500, overlap≈10-15%) -> list[str]`
- `rank_chunks_by_topic(chunks, topic) -> list[str]` — embeds all chunks +
  the topic in one batched call via the existing `openai.OpenAI` client
  (already a dependency, already configured for OpenRouter), cosine-ranks in
  plain Python (no numpy needed at this scale — at most a few dozen short
  vectors), returns chunks ordered most-to-least relevant
- `select_relevant_text(text, topic, target_count) -> str` — the public
  entry point: chunks the text, computes `k` from `target_count`, skips
  embedding entirely if there are ≤ k chunks total (nothing to filter),
  otherwise ranks and keeps the top-k, then concatenates them into one
  string — the graph below never needs to know chunking happened

### `question-generator-worker/helpers/qgen_graph/` (new package, mirrors `ai-agent-chatbot/agent/`'s layout)

- `state.py` — `QuestionGenState` (TypedDict): `source_text`, `topic`,
  `difficulty`, `target_count`, `collected: list[dict]`,
  `seen_hashes: set[str]`, `round: int`, `max_rounds: int`
- `prompts.py` — the existing generation prompt (moved as-is) + a new judge
  prompt
- `nodes.py` — `generate_node`, `judge_node`
- `graph.py` — `build_graph(llm)` / `get_graph()`; `ChatOpenAI` construction
  reuses the exact OpenRouter pattern from `ai-agent-chatbot/agent/graph.py`

### `question_generator.py` (existing file, thinned out)

Keeps `save_questions_to_db` and the existing `_fingerprint`/`_deduplicate`
helpers exactly where they are; `qgen_graph/nodes.py` imports them rather
than duplicating them. `generate_questions_with_llm(text, topic, difficulty,
num_questions)` keeps its exact signature and return type — `pipeline.py`
requires zero changes. Internally it now: calls
`select_relevant_text(text, topic, num_questions)`, builds the graph's
initial state with that curated text, invokes the compiled graph, and
returns `result["collected"][:num_questions]`.

## Data flow per round (unchanged from prior draft)

1. **`generate_node`**: computes `remaining = target_count - len(collected)`,
   builds the prompt, calls the LLM, runs the existing structural validation,
   then MD5-dedupes against `seen_hashes`.
2. **`judge_node`**: one batched LLM call reviews all of this round's
   candidates against topic fit, difficulty fit, and semantic-duplicate
   status versus `collected`. Passing candidates merge into `collected`
   (and their hashes into `seen_hashes`).
3. **Conditional edge**: loop back to `generate_node` (`round += 1`) if
   short of `target_count` and `round < max_rounds`; otherwise end.

## Error handling

Unchanged terminal semantics: empty `collected` after all rounds →
`RuntimeError` (job fails, retried per the existing SQS backoff design).
Non-empty but short → warning + return what passed. No change to
`pipeline.py`'s or `receiver.py`'s failure handling. If chunk embedding
itself fails (network/API error), that's a pipeline failure like any other
today — propagates up, job retried by SQS same as an LLM failure would be.

## Dependencies

Add to `question-generator-worker/requirements.txt` (versions matched to
`ai-agent-chatbot/requirements.txt`):
```
langgraph==0.6.6
langchain-core>=1.4.9,<2.0.0
langchain-openai==1.3.5
```
No new dependency needed for embeddings — `openai==2.46.0` is already
installed and already configured for OpenRouter; embeddings just call
`client.embeddings.create(...)` instead of `client.chat.completions.create(...)`.
No new dependency needed for cosine similarity — plain Python over a few
dozen vectors, no numpy required.

## Testing (TDD, fakes at the LLM/embeddings boundary — no real network calls)

- `generate_node`/`judge_node` take an injected LLM client, same pattern as
  `receiver.py`'s injected `run_pipeline`/`update_job_status`.
- `rank_chunks_by_topic` takes an injected embeddings client.
- Cases to cover:
  - Judge rejects some candidates → only the shortfall is requested next
    round.
  - Judge rejects everything for `max_rounds` rounds → `RuntimeError`.
  - A semantic-duplicate candidate is filtered by the judge even though its
    MD5 hash differs from anything in `collected`.
  - An exact-duplicate candidate is filtered by the MD5 pre-filter *before*
    reaching the judge.
  - A document with fewer chunks than `k` skips the embeddings call
    entirely and uses all chunks unchanged.
  - A document with more chunks than `k` calls the (fake) embeddings client
    once and keeps only the top-k by similarity score.
  - `generate_questions_with_llm`'s public signature/return value is
    unchanged.

## Out of scope

- `pipeline.py`, `receiver.py`, `consumer.py` — untouched.
- `save_questions_to_db` — untouched.
- Vector databases, MinHash, Bloom filters — considered and rejected
  everywhere in this design (see decision summary).
- Any change to the structural-validation rules themselves.
- **Performance/latency optimization** — explicitly deferred. This plan
  adds at least one more LLM call per round (the judge) and one embeddings
  call up front, which makes the job slower than today, not faster. Speeding
  this up (e.g. parallelizing chunk ranking, reducing rounds, model choice)
  is a separate follow-up discussion, not addressed here.
