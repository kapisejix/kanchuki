-- Point the 8 finalized MODEL-tab studio_styles rows (migration 101) at
-- Gemini (imagen_3) instead of the default Kontext cascade. Owner review of
-- Kontext vs Gemini/ChatGPT on the same prompt + product photo found Gemini's
-- pose/smile/lighting realism clearly better — Kontext is a pixel-preserving
-- diffusion editor (strong at "change only what's named"), Gemini is a
-- generative multimodal foundation model with far more human-anatomy/
-- fashion-photography training (it's the same model behind Google Shopping's
-- "Try It On"). PRODUCT-tab rows (no person in frame) are untouched — Kontext's
-- pixel-lock is still the right tradeoff there, and the code-level fallback
-- (generateStudioImage: Gemini -> Kontext -> BFL direct on any failure) means
-- BFL still serves every PRODUCT generation plus every MODEL generation where
-- the Gemini key/quota is unavailable.
UPDATE studio_styles
SET engine = 'imagen_3'
WHERE tab = 'MODEL'::"StudioStyleTab"
  AND slug IN (
    'studio_softbox_indoor', 'home_mirror_selfie', 'golden_hour_outdoor',
    'catwalk_runway_motion', 'editorial_closeup_rim', 'marble_luxury_premium',
    'halfbody_top_indoor', 'social_post_square'
  );
