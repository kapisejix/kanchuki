-- Admin-curated store-directory pin: featured retailers sort to the top of
-- the public /stores directory and the homepage store teaser. Admin-only flag
-- (POST /admin/retailers/:id/feature|unfeature), no retailer-facing surface.
-- featured_at records when the pin was applied (secondary sort key among
-- pinned stores, in pin order).

ALTER TABLE "retailers"
  ADD COLUMN "is_featured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "featured_at" TIMESTAMP(3);

CREATE INDEX "retailers_is_featured_idx" ON "retailers"("is_featured");
