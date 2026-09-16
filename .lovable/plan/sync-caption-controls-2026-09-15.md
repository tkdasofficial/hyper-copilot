# Sync caption controls

## Changes

- Keep captions enabled by default in both creation experiences.
- In Customize Creation, show the existing size slider and live preview only while captions are enabled.
- In Video Agent, add the shared caption-template selector, a 1–10 size slider defaulting to 4, and the same live preview, all conditionally shown when captions are enabled.
- Send the selected template and `caption_scale` through the existing Video Agent request payload.

## Safety

- Do not edit `render.py`, canvas configuration, or any rendering/pipeline logic.
- Limit changes to the two caption-setting interfaces and their existing payload fields.

## Verification

- Check types/build output and test enabled/disabled caption states plus live sizing in the preview.
