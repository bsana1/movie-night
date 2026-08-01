# .agent

Working memory for AI coding agents on this repo. Nothing in here is required
to build or run the app — it exists so an agent picking up this project later
(a new session, a different tool, a different person's assistant) doesn't have
to re-derive context that was already earned once.

- **[STYLE.md](STYLE.md)** — the coding conventions this repo is expected to
  follow. Read before writing code, and update it when a convention changes
  or a new one gets established.
- **[specs/](specs)** — reference docs describing how the system actually
  works: architecture, API contracts, deployment setup. Write one when you
  finish a nontrivial piece of work, so the *design* survives even after the
  chat that produced it is gone. Update a spec in place when it goes stale —
  don't let it silently drift from the code.
- **[skills/](skills)** — step-by-step instructions for a task this repo
  needs done more than once (debugging a specific class of failure, a
  release checklist, etc.). Add one when you solve something the hard way
  and would rather not solve it the hard way again.

This is a living folder, not a spec frozen at creation time. Refine, correct,
and prune it as the project evolves — a stale doc that contradicts the code
is worse than no doc at all.
