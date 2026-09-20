-- Reset studio_styles rows holding the removed text-to-image engines.
-- `flux_pro` / `flux_schnell` never received the product photo in the scene
-- step; they are gone from STUDIO_ENGINES. An unknown engine string does not
-- crash — generateStudioImage falls through to Kontext while the DB still says
-- FLUX — so NULL (= Kontext default) is the honest value.
UPDATE studio_styles SET engine = NULL WHERE engine IN ('flux_pro', 'flux_schnell');
