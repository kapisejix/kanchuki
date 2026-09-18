-- PRODUCT-tab prompt fix: retailer report — the original hanger/hook/clip is
-- still visible in generated shots.
--
-- Root cause, found by re-reading migration 078's 8 PRODUCT prompts verbatim:
-- (1) 6 of 8 rows DID ask for removal, but the "keep garment 100%
--     pixel-identical" clause came FIRST as its own leading sentence, with the
--     "remove the hanger/hook" instruction trailing as an afterthought — BFL's
--     own prompting guidance (docs.bfl.ai/guides/prompting_editing_overview)
--     is explicit that the change should lead and the preserve constraint
--     should be folded into the SAME sentence ("Replace X with Y, keeping Z"),
--     not stacked as two competing instructions.
-- (2) 'wedding_elegant' and 'warm_luxury' NEVER asked for hook/hanger removal
--     at all — both prompts only said "replace the background", so Kontext
--     correctly left the entire foreground (garment + hook) untouched. Not a
--     model failure — the prompt simply never asked.
--
-- Fix: every row now leads with an explicit, unambiguous removal clause
-- ("none of it may remain") in the same sentence as the re-hang/re-fit
-- instruction, and lighting direction is made specific (angle + purpose)
-- instead of a bare "5500K lighting" clause, per the same specificity-wins
-- guidance.
UPDATE studio_styles SET prompt = 'Completely remove the original hanger, hook, clip, peg or any hardware currently holding this garment — none of it may remain in the final image. Re-hang the exact same garment, pixel-identical in colour, print, embroidery, shoulders, neckline and sleeves, on a polished walnut wooden hanger, centred against a seamless white studio backdrop, bright even 5500K softbox key light from directly above-front with a soft secondary fill to avoid harsh contrast, and a soft natural grounding shadow beneath the garment.' WHERE slug = 'display_hanger';

UPDATE studio_styles SET prompt = 'Completely remove the original hanger, hook, clip, peg or any hardware currently holding this garment — none of it may remain in the final image. Re-hang the exact same garment, pixel-identical in colour, print, embroidery, shoulders, neckline and sleeves, on a plain wooden hanger against a pale wooden wall panel, a trailing plant softly out of focus beside it, warm directional window daylight raking across the fabric from one side, soft natural grounding shadow.' WHERE slug = 'studio_home';

UPDATE studio_styles SET prompt = 'Completely remove the original hanger, hook, clip, peg or any hardware currently holding this garment — none of it may remain in the final image. Re-hang the exact same garment, pixel-identical in colour, print, embroidery, shoulders, neckline and sleeves, on a slim matte-white hanger against a minimal off-white background with generous empty space around it, flat even softbox lighting with no visible hotspots, faint natural grounding shadow.' WHERE slug = 'studio_minimal';

UPDATE studio_styles SET prompt = 'Completely remove the original hanger, hook, clip, peg or any hardware currently holding this garment — none of it may remain in the final image. Fit the exact same garment, pixel-identical in colour, print, embroidery, shoulders, neckline and sleeves, naturally onto a clean white headless mannequin form, centred against a seamless white studio backdrop, bright even 5500K key light with a soft fill to keep folds and drape visible without harsh shadow, soft natural grounding shadow beneath the mannequin base.' WHERE slug = 'display_mannequin';

UPDATE studio_styles SET prompt = 'Completely remove the original hanger, hook, clip, peg or any hardware currently holding this garment — none of it may remain in the final image. Re-hang the exact same garment, pixel-identical in colour, print, embroidery, shoulders, neckline and sleeves, on a premium wooden hanger against a seamless mid-grey professional photography backdrop, dramatic softbox key light from 45 degrees with a subtle rim light to separate the garment from the backdrop, soft natural grounding shadow.' WHERE slug = 'studio_pro';

UPDATE studio_styles SET prompt = 'Completely remove the original hanger, hook, clip, peg or any hardware currently holding this garment — none of it may remain in the final image. Re-hang the exact same garment, pixel-identical in colour, print, embroidery, shoulders, neckline and sleeves, on a wooden hanger against a warm beige studio backdrop with subtle depth, soft warm-neutral 5500K key light angled to bring out fabric texture, soft natural grounding shadow.' WHERE slug = 'studio_beige';

UPDATE studio_styles SET prompt = 'Completely remove the original hanger, hook, clip, peg or any hardware currently holding this garment — none of it may remain in the final image. Re-hang the exact same garment, pixel-identical in colour, print, embroidery, shoulders, neckline and sleeves, on a plain hanger against an elegant wedding backdrop of soft floral arrangements and pastel draping, warm romantic key light with gentle falloff, soft natural grounding shadow.' WHERE slug = 'wedding_elegant';

UPDATE studio_styles SET prompt = 'Completely remove the original hanger, hook, clip, peg or any hardware currently holding this garment — none of it may remain in the final image. Re-hang the exact same garment, pixel-identical in colour, print, embroidery, shoulders, neckline and sleeves, on a plain hanger against a warm luxurious beige studio backdrop with subtle depth, neutral colour-true 5500K key light with soft directional falloff to bring out fabric sheen, soft natural grounding shadow.' WHERE slug = 'warm_luxury';
