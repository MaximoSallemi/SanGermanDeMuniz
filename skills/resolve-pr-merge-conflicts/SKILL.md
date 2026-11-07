---
name: resolve-pr-merge-conflicts
description: Resolve Git merge conflicts on a pull-request branch by preserving the intent of both sides, validating the integrated result, and preparing the branch for review. Use when a PR is conflictive or a merge/rebase is already stopped on conflicts; do not use for ordinary code review.
---

# Resolve PR Merge Conflicts

Resolve conflicts semantically. A conflict-free file is not correct if it silently drops behavior from either side.

## Establish the Git state

- Read repository instructions and inspect the current branch, upstream, remotes, target branch, status, and unmerged paths.
- Determine whether a merge, rebase, cherry-pick, or revert is already in progress. Continue that operation's semantics; never start a different history operation on top of it.
- Preserve unrelated tracked and untracked work. Do not auto-stash, clean, reset, abort, or switch branches if that could hide or discard user changes.
- Fetch the relevant remote refs when needed. If no operation is active, prefer merging the PR target into the source branch because it avoids rewriting published history, unless the user or repository explicitly requires rebase.
- Rebase and force-push require explicit user direction. Never push, force-push, merge the PR, or post to GitHub unless requested.

If the target branch, source branch, or desired merge-versus-rebase strategy is materially ambiguous, ask before changing history.

## Understand every conflict

For each unmerged path:

1. inspect the merge base, ours, and theirs, plus relevant surrounding code and commits;
2. identify the independent intent and invariants of both changes;
3. consult the ticket, public contracts, tests, migrations, and call sites;
4. integrate the behaviors deliberately instead of choosing a side wholesale;
5. check adjacent non-conflicting hunks for semantic conflicts Git could not detect.

Do not use repository-wide `ours` or `theirs`. A whole-file choice is acceptable only when evidence proves the other side is generated, obsolete, or intentionally replaced.

## Handle fragile files

- **Dependency lockfiles:** resolve the source manifests first, then regenerate the lockfile with the repository's declared package manager. Do not hand-splice lockfile conflict blocks.
- **Database migrations:** do not rewrite an applied migration. Preserve both schema intents and resolve duplicate versions according to repository conventions, normally by renumbering only the new unreleased migration.
- **Generated files:** resolve the source of truth and regenerate them with the documented tool.
- **Modify/delete and rename conflicts:** determine whether the feature was intentionally removed, moved, or replaced before restoring content.
- **Binary or LFS files:** identify the intended asset version from commits or references. Ask when the correct content cannot be inspected safely.
- **API and configuration files:** preserve compatible fields from both sides and re-check consumers, environment defaults, security, and deployment behavior.

## Validate the resolution

Before marking work complete:

- confirm Git reports no unmerged entries;
- search changed text files for conflict markers and run `git diff --check`;
- review the combined diff against both parent intents so neither feature disappeared;
- run focused tests for the conflicted areas, then the appropriate lint, typecheck, build, integration, or migration checks;
- distinguish code failures from unavailable Docker, network, credentials, or external services;
- stage only the resolved files that belong to the operation.

Do not create a merge commit or run `rebase --continue` unless the user asked to complete the history operation. If completion was requested, verify again after Git advances because later rebase commits can introduce new conflicts.

## Report

Return:

1. the source branch, target branch, and strategy used;
2. each conflicted file and the behavior retained from both sides;
3. tests and checks run, including anything blocked by the environment;
4. whether the tree is conflict-free, staged, committed, or still awaiting user action;
5. any follow-up command the user must explicitly authorize, such as push or force-push.
