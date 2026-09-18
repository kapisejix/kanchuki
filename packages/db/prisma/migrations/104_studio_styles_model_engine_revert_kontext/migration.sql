-- INTERIM — stage 1 of 3 (revert, then two-step pipeline, then a real Gemini client).
--
-- Migration 102 pointed the 8 finalized MODEL-tab rows at engine='imagen_3' on
-- the finding that "Gemini's pose/smile/lighting realism is clearly better".
-- That could not have been the cause of what was observed, because the switch
-- never put the product photo in front of a Gemini model:
--
--   * `generateGoogleImagen()` (apps/api/src/lib/imagen-client.ts) builds its
--     request as `instances: [{ prompt }]` — there is NO image field. It is a
--     text-to-image call against Imagen 3's `:predict` endpoint.
--   * `generateStudioImage()` calls it as `generateGoogleImagen(promptText,
--     { model, onProgress })` — it never passes `inputImageUrl` either.
--
-- So every MODEL scene on this engine was rendered with zero information about
-- the actual garment, from a prompt that (until the accompanying code change)
-- never named a garment type either. A plausible stranger in a plausible
-- stranger's clothes is the correct output of that input, not a tuning miss.
--
-- NULL = the default cascade, which is FLUX Kontext via Fal (subject-preserving,
-- garment pixels kept) and BFL direct as the fallback. Kontext is the right
-- fidelity engine for this stage.
--
-- This also is NOT the long-term answer. Gemini-style pose/smile/lighting
-- realism is wanted and returns in stage 3, where it runs ON the already-correct
-- image (background/pose pass) instead of INSTEAD of it.
--
-- Stage 3 landed: `imagen_3`/`imagen_3_fast` were deleted rather than fixed and
-- renamed to `gemini_image`/`gemini_image_pro` against a client that does send
-- the photo (migration 105). The revert still stands — Gemini reinterprets a
-- garment, so Kontext remains the right default until the two-step pipeline
-- (vton_kontext / vton_gemini) is validated on the admin bench.
--
-- Verify with:
--   SELECT slug, engine FROM studio_styles WHERE tab = 'MODEL' ORDER BY sort_order;
UPDATE studio_styles
SET engine = NULL
WHERE tab = 'MODEL'::"StudioStyleTab"
  AND slug IN (
    'studio_softbox_indoor', 'home_mirror_selfie', 'golden_hour_outdoor',
    'catwalk_runway_motion', 'editorial_closeup_rim', 'marble_luxury_premium',
    'halfbody_top_indoor', 'social_post_square'
  );
