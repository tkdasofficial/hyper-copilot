# Supabase Edge Functions — source of truth in this repo

All ten backend functions live in the Supabase project `uqyuwxztevkokzqldibh`.
This folder holds a versioned copy of each one, in the standard layout:

```text
docs/edge-functions/<function-name>/index.ts
```

The editor blocks writes under `supabase/functions/` for this TanStack stack, so the
mirrored copies live here instead. The layout, file names and contents are identical to
what a `supabase/functions/` tree would contain.

| Function | Purpose |
| --- | --- |
| `generate-audio` | Narration / audio generation |
| `generate-image` | Image generation |
| `generate-video` | Video generation |
| `handle-job-execution` | Job queue execution |
| `process-scheduled-cron` | Scheduled pass driven by the database clock |
| `publish-to-meta` | Facebook / Instagram / Threads publishing |
| `update-record-handler` | Record update webhook handler |
| `video-agent` | Dispatches renders to the render engine (holds `GITHUB_PAT`) |
| `youtube-publish` | YouTube OAuth exchange, upload, metadata update |
| `sync-meta-secrets` | Copies Meta credentials into the encrypted provider store |

## Call model — backend only

These functions are **never** called from the browser. Each one verifies the private
worker token (`x-worker-secret`, checked through `verify_worker_token`) or, for
`sync-meta-secrets`, the management token. Anonymous calls get `403 Forbidden`.

The only callers are:

- the database (triggers + the per-minute tick, via `pipeline_dispatch`), and
- the app's own server modules `src/lib/video-agent.server.ts` and `src/lib/youtube.server.ts`,
  which attach the worker token server-side.

`supabase.functions.invoke(...)` is deliberately **not** used anywhere: it would run in the
browser and expose these privileged endpoints to anyone signed in.

## Edit / deploy flow

```bash
supabase functions download <name> --project-ref uqyuwxztevkokzqldibh
# edit, then copy the result back into docs/edge-functions/<name>/index.ts
supabase functions deploy <name> --project-ref uqyuwxztevkokzqldibh --no-verify-jwt
```

CORS headers, `Deno.env.get(...)` reads and payload handling in each `index.ts` are kept
exactly as deployed.
