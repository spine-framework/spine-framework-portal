-- Migration 004: Indexes

-- accounts
CREATE INDEX idx_accounts_parent_id ON public.accounts(parent_id);
CREATE INDEX idx_accounts_type_id ON public.accounts(type_id);
CREATE INDEX idx_accounts_active ON public.accounts(is_active);

-- people
CREATE INDEX idx_people_account ON public.people(account_id);
CREATE INDEX idx_people_auth_uid ON public.people(auth_uid);
CREATE INDEX idx_people_email ON public.people(email);
CREATE INDEX idx_people_role ON public.people(role_id);
CREATE INDEX idx_people_active ON public.people(is_active);

-- types
CREATE INDEX idx_types_slug ON public.types(slug);
CREATE INDEX idx_types_kind ON public.types(kind);

-- apps
CREATE INDEX idx_apps_slug ON public.apps(slug);
CREATE INDEX idx_apps_owner ON public.apps(owner_account_id);

-- roles
CREATE INDEX idx_roles_slug ON public.roles(slug);

-- items
CREATE INDEX idx_items_type ON public.items(type_id);
CREATE INDEX idx_items_account ON public.items(account_id);
CREATE INDEX idx_items_active ON public.items(is_active);
CREATE INDEX idx_items_created_at ON public.items(created_at);

-- threads
CREATE INDEX idx_threads_type ON public.threads(type_id);
CREATE INDEX idx_threads_account ON public.threads(account_id);
CREATE INDEX idx_threads_target ON public.threads(target_type, target_id);
CREATE INDEX idx_threads_active ON public.threads(is_active);

-- messages
CREATE INDEX idx_messages_thread ON public.messages(thread_id);
CREATE INDEX idx_messages_type ON public.messages(type_id);
CREATE INDEX idx_messages_person ON public.messages(person_id);

-- links
CREATE INDEX idx_links_type ON public.links(type_id);
CREATE INDEX idx_links_account ON public.links(account_id);
CREATE INDEX idx_links_source ON public.links(source_type, source_id);
CREATE INDEX idx_links_target ON public.links(target_type, target_id);

-- attachments
CREATE INDEX idx_attachments_type ON public.attachments(type_id);
CREATE INDEX idx_attachments_account ON public.attachments(account_id);

-- watchers
CREATE INDEX idx_watchers_type ON public.watchers(type_id);
CREATE INDEX idx_watchers_target ON public.watchers(target_type, target_id);
CREATE INDEX idx_watchers_person ON public.watchers(person_id);

-- link_types
CREATE INDEX idx_link_types_slug ON public.link_types(slug);

-- pipelines
CREATE INDEX idx_pipelines_app ON public.pipelines(app_id);
CREATE INDEX idx_pipelines_account ON public.pipelines(account_id);

-- pipeline_executions
CREATE INDEX idx_pe_pipeline ON public.pipeline_executions(pipeline_id);
CREATE INDEX idx_pe_account ON public.pipeline_executions(account_id);
CREATE INDEX idx_pe_status ON public.pipeline_executions(status);

-- triggers
CREATE INDEX idx_triggers_app ON public.triggers(app_id);
CREATE INDEX idx_triggers_account ON public.triggers(account_id);
CREATE INDEX idx_triggers_pipeline ON public.triggers(pipeline_id);

-- trigger_executions
CREATE INDEX idx_te_trigger ON public.trigger_executions(trigger_id);

-- timers
CREATE INDEX idx_timers_app ON public.timers(app_id);
CREATE INDEX idx_timers_account ON public.timers(account_id);
CREATE INDEX idx_timers_pipeline ON public.timers(pipeline_id);

-- ai_agents
CREATE INDEX idx_ai_agents_app ON public.ai_agents(app_id);
CREATE INDEX idx_ai_agents_account ON public.ai_agents(account_id);

-- embeddings
CREATE INDEX idx_embeddings_account ON public.embeddings(account_id);
CREATE INDEX idx_embeddings_model_doc ON public.embeddings(model_id, document_id);

-- integrations
CREATE INDEX idx_integrations_app ON public.integrations(app_id);
CREATE INDEX idx_integrations_account ON public.integrations(account_id);

-- prompt_configs
CREATE INDEX idx_prompt_configs_slug ON public.prompt_configs(slug);
CREATE INDEX idx_prompt_configs_app ON public.prompt_configs(app_id);
CREATE INDEX idx_prompt_configs_account ON public.prompt_configs(account_id);

-- api_keys
CREATE INDEX idx_api_keys_integration ON public.api_keys(integration_id);
CREATE INDEX idx_api_keys_account ON public.api_keys(account_id);
CREATE INDEX idx_api_keys_key_value ON public.api_keys(key_value);

-- api_key_usage_logs
CREATE INDEX idx_akul_api_key ON public.api_key_usage_logs(api_key_id);
CREATE INDEX idx_akul_account ON public.api_key_usage_logs(account_id);
CREATE INDEX idx_akul_created ON public.api_key_usage_logs(created_at);

-- logs
CREATE INDEX idx_logs_account ON public.logs(account_id);
CREATE INDEX idx_logs_level ON public.logs(level);
CREATE INDEX idx_logs_created ON public.logs(created_at);
CREATE INDEX idx_logs_source ON public.logs(source_type, source_id);

-- actions
CREATE INDEX idx_actions_account ON public.actions(account_id);
CREATE INDEX idx_actions_slug ON public.actions(slug);

-- schedules
CREATE INDEX idx_schedules_account ON public.schedules(account_id);
CREATE INDEX idx_schedules_action ON public.schedules(action_id);
CREATE INDEX idx_schedules_next_run ON public.schedules(next_run_at);

-- schedule_executions
CREATE INDEX idx_se_schedule ON public.schedule_executions(schedule_id);
CREATE INDEX idx_se_account ON public.schedule_executions(account_id);
