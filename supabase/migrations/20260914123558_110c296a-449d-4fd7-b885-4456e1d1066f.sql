REVOKE ALL ON FUNCTION public.jobs_dispatch_worker() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.videos_dispatch_pipeline() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workflows_dispatch_scheduler() FROM PUBLIC, anon, authenticated;