# Fix Meta Page linking configuration

## Outcome

Use the Meta App ID, App Secret, and Facebook Login for Business configuration ID already stored in Supabase so the Integrations page recognizes the setup and can open Meta’s consent flow.

## Changes

- Deploy a backend-only synchronization function that reads the existing `META_APP_ID`, `META_APP_SECRET`, and `META_LOGIN_CONFIG_ID` values from Supabase’s function secrets and copies them into the encrypted provider store used by the app.
- Protect that synchronization endpoint with the existing backend credential and invoke it once from the backend.
- Update Meta connection handlers to read all three values from the encrypted provider store rather than the app runtime environment.
- Keep the App Secret server-only; return only the public App ID, configuration ID, and readiness status to the screen.
- Verify the backend rejects public calls, the Integrations page reports Meta as configured, and the consent URL includes the saved configuration ID.

## Technical details

- Reuse the existing `providerSecret` server helper and `set_provider_secret` RPC.
- Convert Meta credential lookups to asynchronous server-only reads and resolve them once per request.
- Do not modify publishing, scheduling, rendering, or social-account storage behavior.
