# Shadow — Full-Stack Take-Home

A small browser agent that answers natural-language questions about marketing
performance over a fixed dataset. It shows its work: every tool call and result
streams into a live "thinking" trace.

It mostly works — but it's rough. **Your job is to make it solid, then extend it.**

Budget your time to **~2–3 hours**. We care about judgment, not gold-plating.
Using AI coding tools (Cursor, Claude Code, Copilot) is expected and encouraged —
we're evaluating the result and how well you understand it.

---

## Setup (no account, no API key required)

Requirements: **Node 18+**.

```bash
npm install
npm run dev        # open the printed localhost URL
```

The app boots in **Mock model** mode — a scripted, deterministic "model" so the
whole thing runs with **no API key**. Everything you need to do can be done in
mock mode.

Optional — wire a **real** model (nice-to-have, not required):

```bash
cp .env.example .env.local   # add a free key from Groq / OpenRouter / Cerebras
npm run dev                  # then flip the header toggle to "Real model"
```

Handy scripts:

```bash
npm run smoke      # runs the tools + agent loop with no browser, prints a report
npm run typecheck  # tsc, no emit
npm run build      # production build
```

---

## Your tasks

### Part A — Fix three known issues

1. **Streaming is broken.** The thinking trace updates live, but the assistant's
   written answer doesn't stream — it snaps in all at once when the turn ends.
   Make the answer stream in token-by-token as it arrives.

2. **Comparison questions hang.** Simple questions work
   ("what was our blended ROAS in June?"), but anything that needs more than one
   tool call — e.g. **"compare Meta and Google for last month"** — spins and never
   gives a clean answer. Make the agent handle a turn where the model asks for
   more than one tool.

3. **The numbers are wrong.** At least one metric the agent reports is incorrect.
   Find the bug(s), fix them, and note briefly how you verified the corrected
   numbers.

### Part B — Add one feature

Pick the version of this you think adds the most value, and keep it tasteful:

> When an answer is a comparison or a time series, render a small inline
> **chart** in the response, and surface **which tool calls / rows** the answer is
> based on (source attribution). Use your judgment on when a visual helps vs.
> clutters.

You may add any libraries or component kits you like (shadcn, Base UI, Recharts,
Tremor, etc.).

### Part C — Write it up (short)

- A **one-page** design note: what each fix was, how you verified the data fix,
  the biggest risk if this shipped to production, and what you'd do with two more
  days.
- A **~5-minute Loom** walking through the app and one tradeoff you made.

---

## Constraints & ground rules

- **Don't rewrite from scratch.** Work in the codebase as given.
- **Keep it runnable.** `npm install && npm run dev` must work, and **mock mode
  must keep working with no key**.
- Time-box to ~2–3 hours. If you run out of time, say what you'd do next in the
  writeup — that counts.

## How we'll evaluate

Roughly: correctness of the fixes, how well you handle the agent loop, streaming
and UX quality, code quality, product judgment (edge cases, when to visualize,
significance), and how clearly you communicate. The walkthrough matters as much
as the code.

## Submitting

Reply with:

- A link to your repo (GitHub/GitLab) **or** a StackBlitz/CodeSandbox fork.
- Your one-page writeup (link or file).
- Your Loom link.

A live deployed URL (Vercel/Netlify/StackBlitz) is a plus, not a requirement.

---

## The codebase

```
src/
  data/dataset.ts        # bundled 90-day marketing dataset (generated, do not edit)
  agent/
    types.ts             # shared types for messages, events, providers
    tools.ts             # tools the agent can call over the dataset
    provider.ts          # mock provider (no key) + OpenAI-compatible provider
    agent.ts             # the agent loop: stream → run tools → repeat
  components/
    Chat.tsx             # conversation state + streaming into the UI
    Message.tsx          # message bubble + thinking trace
    Composer.tsx         # input box
    SettingsBar.tsx      # mock / real model toggle
  App.tsx, main.tsx, styles.css
scripts/
  gen-data.mjs           # regenerates the dataset (deterministic)
  smoke.ts               # no-browser check of tools + loop
```

A few notes about the data: it's a fixed snapshot where **"today" is 2026-07-01**,
so "last month" means **June 2026**. Channel names in the raw data are
intentionally inconsistent (e.g. `Meta` / `meta` / `Facebook`), and a couple of
campaigns have gaps (a paused week, a mid-flight launch). That's real-world
messiness on purpose.

Good luck — have fun with it.
