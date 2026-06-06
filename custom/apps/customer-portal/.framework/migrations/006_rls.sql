-- Migration 006: RLS Policies

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trigger_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_key_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_executions ENABLE ROW LEVEL SECURITY;

-- accounts
CREATE POLICY accounts_access ON public.accounts FOR ALL
  USING (id IN (SELECT public.get_accessible_accounts(public.current_actor_id()))
         OR public.current_actor_id() IS NULL);

-- people
CREATE POLICY people_access ON public.people FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(public.current_actor_id()))
         OR public.current_actor_id() IS NULL);

-- types
CREATE POLICY types_access ON public.types FOR ALL
  USING (public.current_actor_id() IS NOT NULL OR true);

-- apps
CREATE POLICY apps_access ON public.apps FOR ALL
  USING (is_system = true OR owner_account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);

-- roles
CREATE POLICY roles_read ON public.roles FOR SELECT USING (true);
CREATE POLICY roles_modify ON public.roles FOR ALL
  USING ((is_system = true AND public.person_is_system_admin(public.current_actor_id()))
         OR is_system = false OR public.current_actor_id() IS NULL);

-- items
CREATE POLICY items_access ON public.items FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(public.current_actor_id()))
         OR public.current_actor_id() IS NULL);

-- threads
CREATE POLICY threads_access ON public.threads FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);

-- messages
CREATE POLICY messages_access ON public.messages FOR ALL
  USING (EXISTS (SELECT 1 FROM public.threads t
                 WHERE t.id = messages.thread_id
                 AND t.account_id IN (SELECT public.get_accessible_accounts(auth.uid())))
         OR auth.uid() IS NULL);

-- links
CREATE POLICY links_access ON public.links FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);

-- attachments
CREATE POLICY attachments_access ON public.attachments FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);

-- watchers
CREATE POLICY watchers_access ON public.watchers FOR ALL
  USING (auth.uid() IS NOT NULL OR true);

-- link_types
CREATE POLICY link_types_access ON public.link_types FOR ALL
  USING (app_id IS NULL
         OR EXISTS (SELECT 1 FROM public.apps a WHERE a.id = link_types.app_id
                    AND a.owner_account_id IN (SELECT public.get_accessible_accounts(auth.uid())))
         OR auth.uid() IS NULL);

-- pipelines, pipeline_executions, triggers, trigger_executions, timers
CREATE POLICY pipelines_access ON public.pipelines FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);
CREATE POLICY pe_access ON public.pipeline_executions FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);
CREATE POLICY triggers_access ON public.triggers FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);
CREATE POLICY te_access ON public.trigger_executions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.triggers t
                 WHERE t.id = trigger_executions.trigger_id
                 AND t.account_id IN (SELECT public.get_accessible_accounts(auth.uid())))
         OR auth.uid() IS NULL);
CREATE POLICY timers_access ON public.timers FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);

-- ai_agents, embeddings, integrations, prompt_configs
CREATE POLICY ai_agents_access ON public.ai_agents FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);
CREATE POLICY embeddings_access ON public.embeddings FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);
CREATE POLICY integrations_access ON public.integrations FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);
CREATE POLICY prompt_configs_access ON public.prompt_configs FOR ALL
  USING ((app_id IS NULL OR EXISTS (SELECT 1 FROM public.apps a
          WHERE a.id = prompt_configs.app_id
          AND a.owner_account_id IN (SELECT public.get_accessible_accounts(auth.uid()))))
         OR auth.uid() IS NULL);

-- api_keys, api_key_usage_logs
CREATE POLICY api_keys_access ON public.api_keys FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR id = auth.uid() OR auth.uid() IS NULL);
CREATE POLICY akul_access ON public.api_key_usage_logs FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);

-- logs
CREATE POLICY logs_access ON public.logs FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);

-- actions, schedules, schedule_executions
CREATE POLICY actions_access ON public.actions FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);
CREATE POLICY schedules_access ON public.schedules FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);
CREATE POLICY se_access ON public.schedule_executions FOR ALL
  USING (account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
         OR auth.uid() IS NULL);
