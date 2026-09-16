# Professional Image and Art Presets

## Scope

- Replace existing image-style choices with: Photorealistic, Cinematic Film, Studio Photography, Digital Art, 3D Animation, and Vintage Kodak.
- Replace existing art-style choices with: Natural Sunlight, Soft Studio Light, Moody Low-Light, High Contrast Noir, Warm Sunset, and Clean Corporate.
- Make Photorealistic and Natural Sunlight the defaults in Customize Creation and Video Agent.
- Apply the same image-style preset list anywhere else the app offers image or video visual styles.

## Prompt behavior

- Add one shared, browser-safe preset map that converts each label into concise, natural visual wording.
- Use the mapped wording when building image and video generation requests, while preserving the selected labels in saved workflow state.
- Remove automatic cosmic, surreal, hyper-detailed, game-engine, and other artificial quality modifiers from the affected generation paths.
- Preserve user-entered prompts, negative prompts, workflow execution, and rendering behavior.

## Compatibility

- Normalize older saved style values to the new defaults so existing workflows continue to open and run safely.
- Do not modify caption rendering, canvas setup, or the core video render pipeline.

## Verification

- Check type safety and the generated app build.
- Verify the new defaults and all six choices appear in the public Video Agent and image-generation interfaces.
