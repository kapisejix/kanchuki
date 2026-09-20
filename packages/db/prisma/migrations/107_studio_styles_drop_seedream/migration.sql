-- Reset studio_styles rows holding the removed `seedream_v4` engine.
-- Bench 2026-09-20: it lost embroidery density and shifted colour on both
-- lehenga runs. An unknown engine string does not crash — generateStudioImage
-- falls through to Kontext while the DB still says Seedream — so NULL (= Kontext
-- default) is the honest value.
UPDATE studio_styles SET engine = NULL WHERE engine = 'seedream_v4';
