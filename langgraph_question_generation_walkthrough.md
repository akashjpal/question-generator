# LangGraph Question Generation — Walkthrough

## What changed, in one sentence

Question generation used to read only the first page of a PDF and never
double-checked its own work; now it reads the *relevant* parts of any PDF and
grades its own output before handing it back.

## The two problems this fixes

1. **Only page one ever mattered.** The old code took the extracted PDF text
   and hard-cut it to 4,500 characters — roughly one page — before it ever
   reached the AI. A 50-page textbook chapter and a 1-page handout were
   treated identically.
2. **Nothing checked quality.** The old code asked the AI for questions,
   checked the *shape* of the answer (4 options, a real answer letter A–D),
   and called it done. Nothing verified the questions were actually about the
   requested topic, matched the requested difficulty, or weren't secretly the
   same question asked twice in different words (only byte-for-byte identical
   text was ever caught).

## The whole process, in one diagram

```
 PDF bytes
    │
    ▼
 extract_text_from_pdf()  ─────────────────────────────  unchanged
    │  full document text
    ▼
┌───────────────────────────────────────────────────┐
│  NEW — select_relevant_text()  (helpers/chunking.py) │
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
│  NEW — LangGraph generate ⇄ judge loop  (qgen_graph/) │
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

## Walking through it in plain words

**Step 1 — find the right part of the document.** Instead of blindly taking
the first 4,500 characters, the document gets sliced into overlapping,
page-ish-sized chunks. Each chunk gets turned into a list of numbers (an
"embedding") that captures its meaning, the topic gets the same treatment,
and chunks are ranked by how close their meaning is to the topic's. Only the
closest few chunks get used. For a short document, this step does almost
nothing — there's nothing to filter out, so it's skipped entirely and no
extra API call happens. For a long document, it means the AI can now draw
questions from *any* relevant part of the document, not just the beginning.

**Step 2 — generate, then check the work.** The AI writes a batch of
candidate questions, same instructions as before. A second, independent AI
call — the "judge" — then reviews that batch and rejects anything that: isn't
really about the requested topic, doesn't match the requested difficulty, or
means the same thing as a question already accepted (even if worded
completely differently — this is the part a simple text-matching check could
never catch). Whatever survives gets kept. If too few survive, the loop goes
back and asks for exactly the missing amount — never regenerating a whole
batch just because a couple of questions got rejected — up to 5 rounds total
before settling for whatever passed.

Two guardrails carried over unchanged from before: an exact-duplicate check
(MD5 hash of the question text) still runs as a free first pass before the
judge ever sees a candidate, and the final result is truncated to exactly the
number of questions requested even if a round accepted a couple extra.

## Where each piece lives

| File | Role |
|---|---|
| `helpers/chunking.py` | Splits a document into chunks and picks the ones relevant to the topic |
| `helpers/mcq_validation.py` | Structural validation (4 options, valid answer letter) + exact-duplicate MD5 check — used by both the old and new code |
| `helpers/qgen_graph/state.py` | The shared data (`collected` questions so far, `round` counter, etc.) that flows through the generate/judge loop |
| `helpers/qgen_graph/prompts.py` | The two prompts: "write some questions" and "judge these questions" |
| `helpers/qgen_graph/nodes.py` | The actual generate and judge steps |
| `helpers/qgen_graph/graph.py` | Wires the steps into a loop and exposes `run_generation()` |
| `helpers/question_generator.py` | Now a thin wrapper: curate the text, run the loop, done |

`pipeline.py` — the code that actually runs a job end-to-end — needed **zero
changes**. `generate_questions_with_llm(text, topic, difficulty,
num_questions)` still takes the same inputs and returns the same shape of
output; everything new happens inside it.

## A wrinkle found while building it (and how it was fixed)

The plan called for keeping the exact-duplicate helpers
(`_fingerprint`/`_deduplicate`) exactly where they already lived, in
`question_generator.py`, and having the new judge-loop code import them from
there. But `question_generator.py` also needs to *call into* the new
judge-loop code — each file needing something from the other creates an
import cycle Python can't resolve. Fixed by lifting those two helpers (plus
the existing structural-validation function) into their own small file,
`helpers/mcq_validation.py`, that depends on nothing else in this codebase.
Both the old code and the new judge-loop code import from there instead of
from each other. No behavior changed — `question_generator.py` still exposes
these functions under their original names for anything that imports them
from there.

## How it was built

Two independent pieces of this — the chunking module and the LangGraph
generate/judge package — touch entirely separate files and don't depend on
each other, so they were built in parallel by two subagents, each following
strict test-driven development (fakes standing in for the LLM and embeddings
clients, no real network calls in any test, red-test-first). Once both
landed, the two were wired together by hand into `question_generator.py`
(where the one real integration decision — the import cycle above — had to
be made), and the combined result was verified against the live OpenRouter
API before being called done.

## Testing

31 tests pass (19 pre-existing + 5 new for chunking + 7 new for the
generate/judge loop), all using hand-written fake LLM/embeddings clients —
no real network calls in the test suite. Beyond the automated tests, the
whole pipeline was also live-verified against the real OpenRouter API:

- A short document: chunking correctly skipped the embeddings call entirely
  (nothing to filter), and the generate → judge loop produced valid, accepted
  questions in a single round (2 LLM calls total).
- The OpenRouter embeddings endpoint (`openai/text-embedding-3-small`) was
  confirmed reachable and returning proper 1536-dimension vectors.
- A synthetic long document mixing on-topic and off-topic content confirmed
  `rank_chunks_by_topic` correctly ranks the purest on-topic chunk first and
  off-topic chunks last.

## What's explicitly not in this change

Per the approved plan, this rewrite does not touch `pipeline.py`,
`receiver.py`, `consumer.py`, or `save_questions_to_db`, and does not add a
vector database, MinHash, or Bloom filter anywhere (all considered and
rejected — see the implementation plan's decision summary for why).

**Performance was explicitly out of scope for this change and made things
slower, not faster** — there's now at least one extra LLM call per round (the
judge) and one embeddings call up front for long documents. That trade was
made deliberately in exchange for actually-correct, on-topic, non-duplicate
questions. Speeding this back up is a separate, later discussion.
