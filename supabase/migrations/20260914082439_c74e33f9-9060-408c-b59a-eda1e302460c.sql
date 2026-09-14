ALTER TABLE public.workflows DROP CONSTRAINT IF EXISTS workflows_repeat_rule_check;
ALTER TABLE public.workflows ADD CONSTRAINT workflows_repeat_rule_check CHECK (repeat_rule IN ('once','daily','weekly','custom'));
CREATE INDEX IF NOT EXISTS workflows_due_lock_idx ON public.workflows (next_due_at, lock_until) WHERE enabled = true;