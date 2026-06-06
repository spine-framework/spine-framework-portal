# Spine Functions: Core vs Custom

## Overview

This document categorizes all Netlify functions in `.framework/functions/` into **Core** (framework infrastructure) and **Custom** (tenant-specific business logic).

---

## Core Functions (23)

These functions provide the foundational infrastructure for the Spine framework. They are part of the core distribution and should not be modified by custom apps.

| Function | Purpose | Category |
|----------|---------|----------|
| `account-nodes.ts` | Account hierarchy node management | Identity/Hierarchy |
| `admin-data.ts` | Generic CRUD API for 9 runtime entities | Runtime Data |
| `ai-agents.ts` | AI agent configuration and inference | Automation |
| `api-keys.ts` | Machine principal credential management | Auth/Security |
| `apps.ts` | App definition and routing configuration | App Framework |
| `auth.ts` | Session context and principal resolution | Auth |
| `debug-auth.ts` | Authentication debugging utilities | Debug/Dev |
| `embeddings.ts` | Vector storage and similarity search | AI/Data |
| `logs.ts` | System audit log read/ingest API | Observability |
| `integration-routes.ts` | Dynamic webhook routing for integrations | Integration |
| `integrations.ts` | External service connection management | Integration |
| `item-progress.ts` | Per-person, per-item progress tracking | Runtime Data |
| `observability.ts` | Aggregated metrics and analytics | Observability |
| `pipeline-executions.ts` | Pipeline run lifecycle management | Automation |
| `pipelines.ts` | Workflow pipeline definitions | Automation |
| `prompt-configs.ts` | LLM prompt template management | AI/Config |
| `roles.ts` | Role and permission set definitions | Auth/Security |
| `system-cron.ts` | Cron job and threshold alerting | System |
| `system.ts` | Health checks and version info | System |
| `tests.ts` | Test run management | Testing |
| `timers.ts` | Scheduled timer definitions | Automation |
| `triggers.ts` | Event-to-pipeline binding definitions | Automation |
| `types.ts` | Schema type definitions | Core Config |

---

## Custom Functions (15)

These functions implement tenant-specific business logic for the Cortex support application. They are examples of what custom apps built on Spine would create.

| Function | Purpose | Business Domain |
|----------|---------|-----------------|
| `custom_anonymous-sessions.ts` | Anonymous user session management | Portal/Auth |
| `custom_case_analysis.ts` | Support case analysis and scoring | Support/AI |
| `custom_community-escalation.ts` | Community-to-support escalation | Community |
| `custom_cortex-chunks.ts` | Document chunk storage for RAG | Knowledge Base |
| `custom_cortex-handler.ts` | Cortex app request routing | App Router |
| `custom_funnel-scoring.ts` | Lead/opportunity scoring | Sales/Marketing |
| `custom_funnel-signal.ts` | Funnel stage transition events | Sales/Marketing |
| `custom_funnel-timers.ts` | Funnel timeout and SLA tracking | Sales/Marketing |
| `custom_kb-chunker.test.ts` | Knowledge base chunker tests | Testing |
| `custom_kb-chunker.ts` | Document chunking for knowledge base | Knowledge Base |
| `custom_kb-embeddings.ts` | KB vector embedding generation | Knowledge Base |
| `custom_kb-ingestion.ts` | Document ingestion pipeline | Knowledge Base |
| `custom_portal-signals.ts` | Portal signal event handling | Portal |
| `custom_support-triage.ts` | Support ticket routing and triage | Support |
| `custom_tag_management.ts` | Tag/skill management for support | Support |
| `custom_webhook-handlers.ts` | External webhook processing | Integration |

**Note:** `custom_kb-chunker.test.ts` is a test file and is excluded from Netlify deployment.

---

## Naming Convention

- **Core functions**: Simple descriptive names (e.g., `types.ts`, `auth.ts`, `logs.ts`)
- **Custom functions**: Prefixed with `custom_` to distinguish from core (e.g., `custom_support-triage.ts`)

Source files in `v2-custom/functions/` already have the `custom_` prefix. The assembly process copies them as-is to the target directory, making it easy to identify tenant-specific code.

---

## Function Count Summary

| Category | Count |
|----------|-------|
| Core Functions | 23 |
| Custom Functions | 15 |
| **Total** | **38** |

---

## Core Function Categories

### Auth & Security (4)
- `auth.ts` — Session context
- `api-keys.ts` — Machine credentials
- `roles.ts` — Role definitions
- `debug-auth.ts` — Auth debugging

### App Framework (1)
- `apps.ts` — App definitions and routing

### Core Config (1)
- `types.ts` — Schema types

### Automation (5)
- `pipelines.ts` — Workflow definitions
- `triggers.ts` — Event bindings
- `timers.ts` — Scheduled execution
- `pipeline-executions.ts` — Run management
- `ai-agents.ts` — AI automation

### Runtime Data (3)
- `admin-data.ts` — Generic CRUD
- `item-progress.ts` — Progress tracking
- `embeddings.ts` — Vector storage

### Integration (2)
- `integrations.ts` — External services
- `integration-routes.ts` — Webhook routing

### Observability (2)
- `logs.ts` — Audit logs
- `observability.ts` — Metrics/analytics

### System (3)
- `system.ts` — Health/version
- `system-cron.ts` — Cron jobs
- `tests.ts` — Test management

### Identity/Hierarchy (1)
- `account-nodes.ts` — Account hierarchy

### AI/Config (1)
- `prompt-configs.ts` — Prompt templates

---

## Custom Function Categories

### Support Domain (4)
- `custom_case_analysis.ts`
- `custom_support-triage.ts`
- `custom_tag_management.ts`
- `custom_community-escalation.ts`

### Knowledge Base (4)
- `custom_kb-chunker.ts`
- `custom_kb-embeddings.ts`
- `custom_kb-ingestion.ts`
- `custom_cortex-chunks.ts`

### Sales/Marketing Funnel (3)
- `custom_funnel-scoring.ts`
- `custom_funnel-signal.ts`
- `custom_funnel-timers.ts`

### Portal/Auth (1)
- `custom_anonymous-sessions.ts`

### App Router (1)
- `custom_cortex-handler.ts`

### Integration (1)
- `custom_webhook-handlers.ts`

### Testing (1)
- `custom_kb-chunker.test.ts` — Knowledge base chunker tests (excluded from deployment)

---

## Development Guidelines

### When to Create a Core Function
- Defines framework-level infrastructure
- Required by multiple tenant applications
- Manages schema definitions, auth, or automation primitives
- Implements generic CRUD patterns for runtime entities

### When to Create a Custom Function
- Implements tenant-specific business logic
- Extends core patterns for domain needs
- Integrates with external services unique to the tenant
- Handles workflow patterns not in core (e.g., triage, scoring)

### Migration Path
Custom functions that prove generally useful can be promoted to core by:
1. Removing the `custom_` prefix
2. Generalizing business logic
3. Moving from `v2-custom/functions/` to `v2-core/functions/`
4. Updating documentation

---

*Generated from v2-core/functions/ analysis. Last updated: 2026-05-26*
