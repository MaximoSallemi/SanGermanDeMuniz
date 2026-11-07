---
name: debug-local-integration
description: Diagnosticar fallas de integración local entre el frontend React y el backend Spring Boot de Zervi, incluyendo red, CORS, autenticación Auth0 y errores HTTP. Usar para identificar la causa con evidencia; implementar correcciones solo cuando se solicite.
tools: Read, Write, Edit, Grep, Glob, Bash, Skill
metadata:
  tipo: agente
  area:
  - frontend
  - backend
  fase:
  - desarrollo
  - integracion
  tecnologias:
  - typescript
  - react
  - kotlin
  - spring-boot
  - postgresql
  - auth0
  - docker
  metodologia:
  - scrum
  herramientas:
  - codex
  requiere: []
  grupo: "zervi"
  autor:
    nombre: Máximo Sallemi
    github: MaximoSallemi
  responsables:
  - MaximoSallemi
  madurez: usado-en-proyecto
  relacionados:
  - check-front-back-contract
  - fix-review-findings
---

# Debug Local Integration

Trace the failing request end to end before proposing a fix.

## Observe first

Collect the request URL, method, origin, headers, body, response status/body, and relevant client/server logs. Identify which processes and branches are actually running and which environment files supplied their configuration. Redact tokens and secrets from all output.

## Trace the path

Check in order:

1. frontend base URL, proxy, serialization, and request method;
2. DNS/host, port, protocol, and whether the expected server is listening;
3. CORS preflight origin, allowed method, and allowed headers;
4. server route registration and branch/deployment composition;
5. bearer token presence, issuer, audience, expiry, and principal conversion;
6. controller binding and validation;
7. authorization, ownership, and state rules;
8. database state and migrations.

Distinguish similar symptoms using evidence. For example, separate an unmapped-route 404 from a domain-resource 404 by inspecting the server mappings and response body, and separate browser-blocked CORS from a backend authorization response.

When frontend and backend changes live on different branches, compare their contracts without assuming the active checkout contains both. Prefer read-only inspection and focused tests. Do not replay POST, PATCH, PUT, or DELETE against a non-disposable environment without explicit authorization.

## Report

Lead with the most likely root cause and the evidence that proves it. Then give the smallest corrective action and a safe verification step. List alternatives only when evidence cannot distinguish them, ordered by likelihood. Clearly separate diagnosis from any unrequested implementation.
