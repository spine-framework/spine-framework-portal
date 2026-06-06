-- Migration 003: Foreign Keys (circular dependencies resolved)

-- accounts FKs
ALTER TABLE public.accounts ADD CONSTRAINT fk_accounts_parent 
  FOREIGN KEY (parent_id) REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.accounts ADD CONSTRAINT fk_accounts_type 
  FOREIGN KEY (type_id) REFERENCES public.types(id) ON DELETE RESTRICT;
ALTER TABLE public.accounts ADD CONSTRAINT fk_accounts_app 
  FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE SET NULL;
ALTER TABLE public.accounts ADD CONSTRAINT fk_accounts_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.accounts ADD CONSTRAINT fk_accounts_updated_by 
  FOREIGN KEY (updated_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- people FKs
ALTER TABLE public.people ADD CONSTRAINT people_account_id_fkey 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.people ADD CONSTRAINT people_app_id_fkey 
  FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE SET NULL;
ALTER TABLE public.people ADD CONSTRAINT people_role_id_fkey 
  FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE SET NULL;
ALTER TABLE public.people ADD CONSTRAINT people_type_id_fkey 
  FOREIGN KEY (type_id) REFERENCES public.types(id) ON DELETE RESTRICT;
ALTER TABLE public.people ADD CONSTRAINT people_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- types FK
ALTER TABLE public.types ADD CONSTRAINT fk_types_app 
  FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE SET NULL;

-- apps FKs
ALTER TABLE public.apps ADD CONSTRAINT fk_apps_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.apps ADD CONSTRAINT fk_apps_owner_account 
  FOREIGN KEY (owner_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;

-- roles FKs
ALTER TABLE public.roles ADD CONSTRAINT fk_roles_app 
  FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE CASCADE;
ALTER TABLE public.roles ADD CONSTRAINT fk_roles_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

-- items FKs
ALTER TABLE public.items ADD CONSTRAINT fk_items_type 
  FOREIGN KEY (type_id) REFERENCES public.types(id) ON DELETE RESTRICT;
ALTER TABLE public.items ADD CONSTRAINT fk_items_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.items ADD CONSTRAINT fk_items_app 
  FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE SET NULL;
ALTER TABLE public.items ADD CONSTRAINT fk_items_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.items ADD CONSTRAINT fk_items_updated_by 
  FOREIGN KEY (updated_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- threads FKs
ALTER TABLE public.threads ADD CONSTRAINT fk_threads_type 
  FOREIGN KEY (type_id) REFERENCES public.types(id) ON DELETE RESTRICT;
ALTER TABLE public.threads ADD CONSTRAINT fk_threads_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.threads ADD CONSTRAINT fk_threads_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.threads ADD CONSTRAINT fk_threads_updated_by 
  FOREIGN KEY (updated_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- messages FKs
ALTER TABLE public.messages ADD CONSTRAINT fk_messages_type 
  FOREIGN KEY (type_id) REFERENCES public.types(id) ON DELETE RESTRICT;
ALTER TABLE public.messages ADD CONSTRAINT fk_messages_thread 
  FOREIGN KEY (thread_id) REFERENCES public.threads(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT fk_messages_person 
  FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD CONSTRAINT fk_messages_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- links FKs
ALTER TABLE public.links ADD CONSTRAINT fk_links_type 
  FOREIGN KEY (type_id) REFERENCES public.types(id) ON DELETE RESTRICT;
ALTER TABLE public.links ADD CONSTRAINT fk_links_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.links ADD CONSTRAINT fk_links_link_type 
  FOREIGN KEY (link_type_id) REFERENCES public.link_types(id) ON DELETE SET NULL;
ALTER TABLE public.links ADD CONSTRAINT fk_links_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.links ADD CONSTRAINT fk_links_updated_by 
  FOREIGN KEY (updated_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- attachments FKs
ALTER TABLE public.attachments ADD CONSTRAINT fk_attachments_type 
  FOREIGN KEY (type_id) REFERENCES public.types(id) ON DELETE RESTRICT;
ALTER TABLE public.attachments ADD CONSTRAINT fk_attachments_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.attachments ADD CONSTRAINT fk_attachments_uploaded_by 
  FOREIGN KEY (uploaded_by) REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.attachments ADD CONSTRAINT fk_attachments_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- watchers FKs
ALTER TABLE public.watchers ADD CONSTRAINT fk_watchers_type 
  FOREIGN KEY (type_id) REFERENCES public.types(id) ON DELETE RESTRICT;
ALTER TABLE public.watchers ADD CONSTRAINT fk_watchers_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.watchers ADD CONSTRAINT fk_watchers_person 
  FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;
ALTER TABLE public.watchers ADD CONSTRAINT fk_watchers_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- link_types FK
ALTER TABLE public.link_types ADD CONSTRAINT fk_link_types_app 
  FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE CASCADE;

-- pipelines FKs
ALTER TABLE public.pipelines ADD CONSTRAINT fk_pipelines_app 
  FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE CASCADE;
ALTER TABLE public.pipelines ADD CONSTRAINT fk_pipelines_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.pipelines ADD CONSTRAINT fk_pipelines_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- pipeline_executions FKs
ALTER TABLE public.pipeline_executions ADD CONSTRAINT fk_pe_pipeline 
  FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE CASCADE;
ALTER TABLE public.pipeline_executions ADD CONSTRAINT fk_pe_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.pipeline_executions ADD CONSTRAINT fk_pe_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- triggers FKs
ALTER TABLE public.triggers ADD CONSTRAINT fk_triggers_app 
  FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE CASCADE;
ALTER TABLE public.triggers ADD CONSTRAINT fk_triggers_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.triggers ADD CONSTRAINT fk_triggers_pipeline 
  FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE SET NULL;
ALTER TABLE public.triggers ADD CONSTRAINT fk_triggers_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- trigger_executions FK
ALTER TABLE public.trigger_executions ADD CONSTRAINT fk_te_trigger 
  FOREIGN KEY (trigger_id) REFERENCES public.triggers(id) ON DELETE CASCADE;

-- timers FKs
ALTER TABLE public.timers ADD CONSTRAINT fk_timers_app 
  FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE CASCADE;
ALTER TABLE public.timers ADD CONSTRAINT fk_timers_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.timers ADD CONSTRAINT fk_timers_pipeline 
  FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE SET NULL;
ALTER TABLE public.timers ADD CONSTRAINT fk_timers_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- ai_agents FKs
ALTER TABLE public.ai_agents ADD CONSTRAINT fk_ai_agents_app 
  FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE CASCADE;
ALTER TABLE public.ai_agents ADD CONSTRAINT fk_ai_agents_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.ai_agents ADD CONSTRAINT fk_ai_agents_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- embeddings FK
ALTER TABLE public.embeddings ADD CONSTRAINT fk_embeddings_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

-- integrations FKs
ALTER TABLE public.integrations ADD CONSTRAINT fk_integrations_app 
  FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE CASCADE;
ALTER TABLE public.integrations ADD CONSTRAINT fk_integrations_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.integrations ADD CONSTRAINT fk_integrations_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- prompt_configs FKs
ALTER TABLE public.prompt_configs ADD CONSTRAINT fk_prompt_configs_app 
  FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE CASCADE;
ALTER TABLE public.prompt_configs ADD CONSTRAINT fk_prompt_configs_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.prompt_configs ADD CONSTRAINT fk_prompt_configs_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- api_keys FKs
ALTER TABLE public.api_keys ADD CONSTRAINT fk_api_keys_integration 
  FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;
ALTER TABLE public.api_keys ADD CONSTRAINT fk_api_keys_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.api_keys ADD CONSTRAINT fk_api_keys_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- api_key_usage_logs FK
ALTER TABLE public.api_key_usage_logs ADD CONSTRAINT fk_akul_api_key 
  FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE CASCADE;
ALTER TABLE public.api_key_usage_logs ADD CONSTRAINT fk_akul_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

-- logs FKs
ALTER TABLE public.logs ADD CONSTRAINT fk_logs_person 
  FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.logs ADD CONSTRAINT fk_logs_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

-- actions FK
ALTER TABLE public.actions ADD CONSTRAINT fk_actions_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.actions ADD CONSTRAINT fk_actions_machine_principal 
  FOREIGN KEY (default_machine_principal_id) REFERENCES public.api_keys(id) ON DELETE SET NULL;
ALTER TABLE public.actions ADD CONSTRAINT fk_actions_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- schedules FKs
ALTER TABLE public.schedules ADD CONSTRAINT fk_schedules_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.schedules ADD CONSTRAINT fk_schedules_action 
  FOREIGN KEY (action_id) REFERENCES public.actions(id) ON DELETE CASCADE;
ALTER TABLE public.schedules ADD CONSTRAINT fk_schedules_machine 
  FOREIGN KEY (machine_principal_id) REFERENCES public.api_keys(id) ON DELETE SET NULL;
ALTER TABLE public.schedules ADD CONSTRAINT fk_schedules_created_by 
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- schedule_executions FKs
ALTER TABLE public.schedule_executions ADD CONSTRAINT fk_se_schedule 
  FOREIGN KEY (schedule_id) REFERENCES public.schedules(id) ON DELETE CASCADE;
ALTER TABLE public.schedule_executions ADD CONSTRAINT fk_se_account 
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.schedule_executions ADD CONSTRAINT fk_se_machine 
  FOREIGN KEY (machine_principal_id) REFERENCES public.api_keys(id) ON DELETE SET NULL;
