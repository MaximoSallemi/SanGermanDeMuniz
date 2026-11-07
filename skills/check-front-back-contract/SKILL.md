---
name: check-front-back-contract
description: Comparar los contratos entre el frontend React/TypeScript y el backend Kotlin/Spring Boot de Zervi, incluso en distintas branches, e identificar incompatibilidades concretas de la API. Usar para verificar la integración entre ambas capas.
tools: Read, Write, Edit, Grep, Glob, Bash, Skill
metadata:
  tipo: agente
  area:
  - frontend
  - backend
  fase:
  - revision
  - integracion
  tecnologias:
  - typescript
  - react
  - kotlin
  - spring-boot
  - postgresql
  - auth0
  metodologia:
  - scrum
  herramientas:
  - codex
  requiere:
  - github
  grupo: "zervi"
  autor:
    nombre: Máximo Sallemi
    github: MaximoSallemi
  responsables:
  - MaximoSallemi
  madurez: usado-en-proyecto
  relacionados:
  - debug-local-integration
  - ticket-test-matrix
---

# Check Front/Back Contract

Determine whether the two sides can interoperate as implemented, not merely whether their tickets look similar.

## Establish the comparison

- Identify the frontend and backend refs, environments, and applicable specifications.
- Prefer `git show <ref>:<path>`, diffs, or worktrees when implementations live on different branches. Change the active branch only when the user explicitly requests it.
- Preserve unrelated working-tree changes. Distinguish contract compatibility from whether the current checkout or deployment actually contains both implementations.

## Build the contract matrix

For every operation, compare:

- HTTP method and fully resolved path;
- query parameters, defaults, omission rules, casing, and pagination;
- request body fields, validation, optionality, trimming, and unknown-field behavior;
- bearer-token handling, actor identity, roles, ownership, and participant checks;
- success status and response shape;
- error status, body, and frontend parsing;
- UUIDs, enums, timestamps, decimals, nullability, and ordering;
- CORS methods and headers for browser consumers.

Trace values beyond DTO declarations. Confirm what the frontend actually serializes and what the backend actually persists or returns.

## Validate

Run focused contract tests, type checks, builds, or safe local probes when available. Do not replay state-changing requests against a non-disposable environment without explicit authorization. Treat infrastructure failures separately from contract failures.

## Report

Lead with one verdict: compatible, compatible with caveats, or incompatible. For each mismatch, include the affected operation, both observed contracts, user-visible impact, and correction direction. Cite repository-relative paths and changed lines. Do not call an optional extra backend field incompatible unless it changes behavior or violates the agreed contract.
