---
name: pre-pr-gate
description: Perform a final, evidence-based readiness check on the current branch before opening or updating a pull request. Use for pre-PR validation; do not create, push, merge, or post the PR unless explicitly requested.
---

# Pre-PR Gate

Decide whether the branch is ready to review and merge, while preserving the user's working tree.

## Establish scope

- Read applicable repository instructions and the ticket or PR description when available.
- Inspect branch, upstream, remotes, and working-tree state.
- Determine the intended target branch, fetch safely when needed, compute the merge-base, and inspect `merge-base..HEAD`.
- Do not treat unrelated untracked user files as PR changes. Never clean, reset, discard, commit, push, or rebase without explicit authorization.

## Gate checks

Review for:

- accidental generated files, secrets, debug code, binary changes, and unrelated edits;
- incomplete acceptance criteria or out-of-scope additions;
- frontend/backend, schema/entity, and migration compatibility;
- migration numbering, destructive DDL, constraints, indexes, and rollback implications;
- auth, authorization, error handling, concurrency, and data-integrity regressions;
- missing tests for changed behavior;
- target-branch drift or likely merge conflicts.

Run the repository's relevant formatting, lint, typecheck, unit, integration, build, and migration checks. Use focused checks first when the full suite is expensive. Report unavailable infrastructure as unverified, not passed or failed.

## Verdict

Return exactly one readiness verdict:

- **Ready** — no blocking issue found and required checks passed.
- **Ready with caveats** — mergeable, with clearly bounded non-blocking risks.
- **Not ready** — list blocking findings in priority order.

Include the target/base used, commits reviewed, verification results, unverified checks, and a concise PR summary when useful. Keep style-only notes separate from blockers.
