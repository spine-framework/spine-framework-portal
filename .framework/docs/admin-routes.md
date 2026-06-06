# Admin Route Inventory (v2-core)

## Data Management Routes (admin/data/*)

| Route | Purpose | Page Component | Entity | Notes |
|-------|---------|----------------|--------|-------|
| `/admin/data/accounts` | List accounts | AccountsPage | Account records | Runtime account management |
| `/admin/data/accounts/new` | Create account | AccountCreatePage | Account records | |
| `/admin/data/accounts/:id` | Account detail/edit | AccountDetailPage | Account records | |
| `/admin/data/people` | List people | PeoplePage | Person records | |
| `/admin/data/people/new` | Create person | PersonCreatePage | Person records | |
| `/admin/data/people/:id` | Person detail/edit | PersonDetailPage | Person records | |
| `/admin/data/items` | List items | ItemsPage | Item records | |
| `/admin/data/items/new` | Create item | ItemCreatePage | Item records | |
| `/admin/data/items/:id` | Item detail/edit | ItemDetailPage | Item records | |

## Configuration Management Routes (admin/configs/*)

| Route | Purpose | Page Component | Entity | Notes |
|-------|---------|----------------|--------|-------|
| `/admin/configs/types` | List item types | TypesPage | Type definitions | kind='item' |
| `/admin/configs/types/new` | Create item type | TypeDetailPage | Type definitions | |
| `/admin/configs/types/:id` | Item type detail/edit | TypeDetailPage | Type definitions | |
| `/admin/configs/accounts` | List account types | AccountTypesPage | Type definitions | kind='account' |
| `/admin/configs/accounts/new` | Create account type | AccountTypeDetailPage | Type definitions | |
| `/admin/configs/accounts/:id` | Account type detail/edit | AccountTypeDetailPage | Type definitions | |
| `/admin/configs/people` | List person types | PersonTypesPage | Type definitions | kind='person' |
| `/admin/configs/people/new` | Create person type | PersonTypeDetailPage | Type definitions | |
| `/admin/configs/people/:id` | Person type detail/edit | PersonTypeDetailPage | Type definitions | |
| `/admin/configs/apps` | List apps | AppsPage | App definitions | |
| `/admin/configs/apps/new` | Create app | AppDetailPage | App definitions | |
| `/admin/configs/apps/:id` | App detail/edit | AppDetailPage | App definitions | |
| `/admin/configs/pipelines` | List pipelines | PipelinesPage | Pipeline definitions | |
| `/admin/configs/pipelines/new` | Create pipeline | PipelineDetailPage | Pipeline definitions | |
| `/admin/configs/pipelines/:id` | Pipeline detail/edit | PipelineDetailPage | Pipeline definitions | |
| `/admin/configs/triggers` | List triggers | TriggersPage | Trigger definitions | |
| `/admin/configs/triggers/new` | Create trigger | TriggerDetailPage | Trigger definitions | |
| `/admin/configs/triggers/:id` | Trigger detail/edit | TriggerDetailPage | Trigger definitions | |
| `/admin/configs/ai-agents` | List AI agents | AIAgentsPage | AI agent definitions | |
| `/admin/configs/ai-agents/new` | Create AI agent | AIAgentDetailPage | AI agent definitions | |
| `/admin/configs/ai-agents/:id` | AI agent detail/edit | AIAgentDetailPage | AI agent definitions | |
| `/admin/configs/embeddings` | List embeddings | EmbeddingsPage | Embedding definitions | |
| `/admin/configs/embeddings/new` | Create embedding | EmbeddingDetailPage | Embedding definitions | |
| `/admin/configs/embeddings/:id` | Embedding detail/edit | EmbeddingDetailPage | Embedding definitions | |
| `/admin/configs/timers` | List timers | TimersPage | Timer definitions | |
| `/admin/configs/timers/new` | Create timer | TimerDetailPage | Timer definitions | |
| `/admin/configs/timers/:id` | Timer detail/edit | TimerDetailPage | Timer definitions | |
| `/admin/configs/integrations` | List integrations | IntegrationsPage | Integration definitions | |
| `/admin/configs/integrations/new` | Create integration | IntegrationDetailPage | Integration definitions | |
| `/admin/configs/integrations/:id` | Integration detail/edit | IntegrationDetailPage | Integration definitions | |

## Legacy Routes (Deprecated)

| Route | Purpose | Page Component | Entity | Notes |
|-------|---------|----------------|--------|-------|
| `/admin/accounts` | Accounts (legacy) | AccountsPage | Account records | Use /admin/data/accounts |
| `/admin/accounts/:id` | Account detail (legacy) | AccountDetailPage | Account records | Use /admin/data/accounts/:id |
| `/admin/people` | People (legacy) | PeoplePage | Person records | Use /admin/data/people |
| `/admin/people/:id` | Person detail (legacy) | PersonDetailPage | Person records | Use /admin/data/people/:id |
| `/admin/types` | Types (legacy) | TypesPage | Type definitions | Use /admin/configs/types |
| `/admin/types/:id` | Type detail (legacy) | TypeDetailPage | Type definitions | Use /admin/configs/types/:id |
| `/admin/apps` | Apps (legacy) | AppsPage | App definitions | Use /admin/configs/apps |
| `/admin/pipelines` | Pipelines (legacy) | PipelinesPage | Pipeline definitions | Use /admin/configs/pipelines |
| `/admin/triggers` | Triggers (legacy) | TriggersPage | Trigger definitions | Use /admin/configs/triggers |
| `/admin/ai-agents` | AI agents (legacy) | AIAgentsPage | AI agent definitions | Use /admin/configs/ai-agents |
| `/admin/embeddings` | Embeddings (legacy) | EmbeddingsPage | Embedding definitions | Use /admin/configs/embeddings |
| `/admin/timers` | Timers (legacy) | TimersPage | Timer definitions | Use /admin/configs/timers |

## Summary

- **Total routes**: 43 active routes (25 data/config + 10 legacy)
- **Data routes**: 9 (accounts, people, items)
- **Config routes**: 34 (types, apps, pipelines, triggers, ai-agents, embeddings, timers, integrations)
- **Legacy routes**: 10 (deprecated but still active)

All routes are defined in `v2-core/src/App.tsx` and use lazy-loaded components from `v2-core/src/pages/`.
