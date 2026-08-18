-- Roadmap M — Multi-Language AI: preferred locale for the retailer app UI.
-- Defaults to 'en-IN' (English). Content language (AI descriptions) is
-- driven by the customer's locale, not the retailer's UI locale.
-- Full UI translation is deferred post-launch; this column establishes the
-- data model so the Settings → Language toggle can read/write it later.

ALTER TABLE "retailers" ADD COLUMN "preferred_locale" TEXT DEFAULT 'en-IN';
