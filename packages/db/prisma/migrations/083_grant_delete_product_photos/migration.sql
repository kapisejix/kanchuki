-- 083: Grant DELETE on product_photos to kanchuki_app
-- Issue: DELETE /v1/products/:id/photos/:photoId 500s with
--   "42501: permission denied for table product_photos"
-- Root cause: kanchuki_app role has SELECT/INSERT/UPDATE only (§19.1),
--   but the photo-delete handler needs DELETE on this table.
-- NOTE: This intentionally narrows the §19.1 invariant for one table.
--   If soft-delete is added later (deleted_at column), this GRANT can
--   be revoked and the migration reverted.
GRANT DELETE ON product_photos TO kanchuki_app;
