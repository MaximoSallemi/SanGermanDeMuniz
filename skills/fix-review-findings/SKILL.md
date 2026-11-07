---
name: fix-review-findings
description: Validate PR review findings against the current branch, implement the findings that remain correct, verify the changes, and draft GitHub-ready replies. Use when the user asks to address review comments; do not blindly apply unverified feedback.
---

# Fix Review Findings

Treat every review comment as a hypothesis until the current code, ticket, and runtime behavior support it.

## Triage each finding

Classify it as:

- **Valid:** still reproducible and within scope.
- **Already fixed:** the current branch no longer has the issue.
- **Invalid:** contradicted by code, contract, or framework behavior.
- **Needs a decision:** a product or architecture choice is missing.

Record concrete evidence. Check the referenced revision because line numbers and behavior may have changed since the review.

## Apply valid fixes

- Read applicable repository instructions and inspect the working tree first.
- Preserve unrelated user changes and avoid broad cleanup.
- Fix the root cause with the smallest coherent change.
- Add or improve tests that fail before the fix and verify observable behavior rather than implementation wording.
- Do not expand the ticket, change public contracts, or add dependencies without justification.
- Stop and ask when findings conflict or require a material product decision.

Do not commit, push, resolve GitHub conversations, or post replies unless the user explicitly requests those external actions.

## Verify and hand off

Run the most relevant focused tests, then broader lint/build/test checks in proportion to risk. Separate code failures from unavailable Docker, network, credentials, or services.

Return:

1. fixes applied, grouped by finding;
2. tests and checks run;
3. unresolved or rejected findings with evidence;
4. one concise GitHub-ready reply per original comment.
