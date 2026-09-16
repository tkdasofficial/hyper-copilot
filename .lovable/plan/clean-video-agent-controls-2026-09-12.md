# Clean Video Agent controls

## Goal

Make the Video Agent page faster to scan on mobile and desktop by giving each feature its own compact expandable drawer.

## Changes

- Keep the story prompt as the primary always-visible input.
- Split grouped controls into focused drawers for theme, duration, negative prompt, guidance, aspect ratio, image style, motion, voice, captions, quality, and bitrate.
- Keep every drawer collapsed initially so the page starts clean.
- Show the currently selected value in each drawer header for quick scanning.
- Remove the suggestion card, explanatory blurbs, decorative terminal chrome, redundant status block, and other nonessential copy.
- Show the render log only while a render is active or when messages exist.
- Preserve rendering, credit handling, realtime progress, playback, and download behavior.
- Verify the streamlined page at mobile and desktop sizes.

## Technical details

- Reuse the existing accessible `Panel` control for each independent drawer.
- Keep all existing request fields and state bindings unchanged.
- Use existing semantic design tokens and control components.
