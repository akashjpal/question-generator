---
name: fix-bug
description: Diagnose a reported bug, write an RCA, brainstorm multiple candidate fixes with trade-offs, get the user to approve one, implement it against a tracked todo list, then write a plain-language walkthrough. Use when the user reports a bug, asks to fix/debug something, pastes an error/stack trace, or asks for an RCA.
---

# Fix Bug

A bug fix is not "find it, patch it." It is four gated stages — diagnose,
propose, implement, explain — and the user signs off between stage 2 and
stage 3. Do not skip ahead to editing code before that approval.

This skill formalizes the "Bugs" and "Behavior Rules" sections of this
repo's `CLAUDE.md`. If those sections change, this skill should be updated
to match — they are the source of truth for file-naming and todo
conventions.

## Stage 1 — Diagnose (RCA)

Ultrathink before touching code: reproduce the symptom if possible, read
the failing path end-to-end, and identify the actual root cause, not just
where the error surfaces.

Write `RCA_Bug_<ShortName>.md` at the repo root (match existing casing,
e.g. `RCA_Bug_AutoSaveRandomId.md`). Include:

- **Symptom** — what the user observed/reported.
- **Root cause** — the actual mechanism, with file:line references.
- **Evidence** — how you confirmed it (logs, repro steps, code trace).
- **Blast radius** — what else touches this code path and could share the
  bug.

Do not propose a fix yet in this file — root cause only.

## Stage 2 — Brainstorm candidate fixes

Invoke the `brainstorming` skill to generate genuinely distinct fix
options for the confirmed root cause (not variations of the same patch).
For each candidate capture:

- What changes, and where.
- Trade-offs (correctness, blast radius, complexity, consistency with
  existing patterns in this codebase).
- Any risk or migration concern.

Present the options to the user with `AskUserQuestion` (or plain
conversation if the choice is a nuanced judgment call) and get an explicit
approval on exactly one approach before writing any implementation code.
Per this repo's `CLAUDE.md`: if you have doubt about which option fits,
ask — do not assume.

## Stage 3 — Implement (tracked)

Once an approach is approved, break it into a `todo.md` per this repo's
Behavior Rules:

- `[ ]` pending, `[~]` in progress, `[x]` done.
- Update the file after every step, in sequence — do not skip or reorder
  steps. If blocked, note the blocker in `todo.md` rather than silently
  moving to the next item.

Implement each step, running the relevant service's tests/build where
applicable (see this repo's `CLAUDE.md` "Commands" section for the
per-service commands). Confirm the original symptom from Stage 1 is
actually gone before marking the todo complete.

## Stage 4 — Walkthrough

Write `<ShortName>_walkthrough.md` (match the existing convention, e.g.
`agentic_chatbot_walkthrough.md`) explaining, in simple and focused words:

- What was broken and why (one paragraph, no jargon).
- What changed to fix it.
- A diagram (mermaid — sequence or flow, whichever fits the bug) showing
  before/after or the corrected flow.

Keep it short enough that someone unfamiliar with the code can read it in
under two minutes.

## End of task

Summarize: symptom, root cause, the approach that was approved and why,
and confirm all `todo.md` items are `[x]`. Point to the three artifacts
produced: `RCA_Bug_<ShortName>.md`, `todo.md`, `<ShortName>_walkthrough.md`.
