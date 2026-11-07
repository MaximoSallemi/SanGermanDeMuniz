---
name: ticket-test-matrix
description: Convert a ticket or specification into a traceable test matrix and audit the repository's real coverage against it. Use for acceptance-test planning or coverage reviews; do not implement tests unless the user asks.
---

# Ticket Test Matrix

Read the complete ticket and separate normative requirements from examples, assumptions, and out-of-scope items.

## Derive cases

Create stable case IDs and capture, as applicable:

- requirement or acceptance criterion;
- layer: unit, integration, persistence, contract, component, route, or end-to-end;
- actor, role, ownership, authentication state, and starting state;
- input, boundary, or concurrent action;
- expected status, response, UI state, side effect, event, cache change, or rollback;
- required environment such as PostgreSQL, Docker, Auth0, or browser layout.

Cover happy paths and meaningful failures, especially authorization, state transitions, nullable values, validation boundaries, stable ordering, atomicity, concurrency, retries, and empty/loading/error states. Do not invent requirements outside the ticket.

## Audit existing tests

Map each case to the actual assertions and code path exercised. A matching test name is not evidence. Mark coverage as:

- **Covered:** reaches the intended condition and asserts the required outcome.
- **Partial:** exercises only part of the requirement or lacks a critical assertion.
- **Missing:** no meaningful test reaches it.
- **Blocked:** requires unavailable infrastructure or authority.

Watch for combined-invalid-input tests where an earlier validation prevents the advertised condition from running, mocks that bypass the contract being tested, and transactional tests that never prove committed persistence.

## Output

Return a compact Markdown table with case ID, requirement, expected behavior, existing test, and coverage. Follow it with prioritized gaps and the smallest recommended test additions. If asked to implement tests, preserve the matrix as the acceptance checklist and verify every added test fails for the intended reason before the fix when practical.
