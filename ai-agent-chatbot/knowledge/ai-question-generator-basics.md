# AI Question Generator — Basics

## What this assistant does
I turn a PDF you upload into a multiple-choice quiz, publish it, and hand you
back a shareable attempt link and join code — all in this chat, without you
having to click through the usual upload → generate → publish wizard.

## Information I'll need from you
To generate and publish a quiz I need:

- **Title** — what to call the quiz. If you don't give me one, I'll suggest
  something based on your PDF's filename.
- **Subject** — e.g. Biology, History, Mathematics, Physics, Chemistry,
  Literature, General Knowledge, or anything else — freeform is fine.
- **Topic** *(optional)* — narrows the focus within the subject/PDF.
- **Difficulty** — easy, medium, hard, or expert.
- **Number of questions** — how many MCQs to generate (10 is a common
  default).
- **Time limit** — how many minutes students get to attempt the quiz
  (15 minutes is a common default).

I'll ask you for anything missing before I start generating — I won't
generate or publish with guessed values for these.

## Example things you can say
- "Here's a chapter PDF — make 10 medium-difficulty questions on cell
  biology, 20 minute time limit."
- "Generate a hard 15-question quiz on this document, subject Physics."
- "Use the PDF I just attached, easy difficulty, 5 questions, no rush on the
  time limit — default is fine."
- "Publish it" / "Yes, go ahead" (once I've confirmed all the details back to
  you).

## What happens when I publish
Publishing is immediate and live — as soon as I publish, the quiz is
reachable at its attempt link and students can join with the code right
away. You'll get both the **attempt link** and the **join code** back from
me; share both with your students (the code isn't embedded in the link, so
both are needed). Because questions are LLM-generated, it's worth
spot-checking them in "My Quizzes" before wide distribution.

## Editing a published quiz
Once a quiz is published, you can ask me to change its title, subject, topic,
difficulty, description, or time limit — I'll update it in place, same join
code and attempt link. I can't edit individual question text, options, or
correct answers through chat — for that, use the regular quiz editor.

## Limitations (v1)
- PDF uploads only, one file per quiz.
- Each chat session tracks one quiz-in-progress at a time.

## About this app
- **Agentic Mode** (this chat) is an alternative to the manual
  upload/generate/publish wizard — same underlying pipeline, conversational
  interface.
- **My Quizzes** (left sidebar) is where you see everything you've created —
  drafts and published — and can copy links/codes again later.
- **Reports** (left sidebar) shows how students performed once they've
  attempted a published quiz.
- The **join code** is a 6-character code students type in on the attempt
  page after opening the attempt link — both are required to start a quiz.
