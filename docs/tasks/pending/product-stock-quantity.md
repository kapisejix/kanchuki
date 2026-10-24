# Product stock quantity (per size)

**Opened:** 2026-10-24 · **Status:** 🟨 Built + MERGED 2026-10-24 (PR #154, `642a11ae`); migration 137 applied in prod (verified read-only 2026-10-24); needs new EAS mobile build + device test · **Priority:** foundation for future online selling

Owner decisions (2026-10-24): per-product, **per-size** stock; no per-colour counts; all plans; **no online selling now**, but the model must allow automatic decrement on sale later; bulk/PDF import defaults quantity to **1** (retailer edits later).

---

## 1. Goal

Retailer records how many units of each size they hold when adding or editing a product. Nothing is sold online yet, so v1 is retailer-managed data only; the schema is shaped so a future order flow can decrement it atomically.

## 2. Data model (proposed, needs owner-applied migration)

New table `product_stock` rather than a JSON column on `products`: a future checkout needs an atomic `UPDATE ... SET quantity = quantity - n WHERE quantity >= n`, which JSON cannot do cleanly.

| Column | Type | Notes |
|---|---|---|
| `id` | text pk | cuid |
| `product_id` | text FK -> products, ON DELETE CASCADE | |
| `retailer_id` | text | RLS column (every retailer table needs RLS) |
| `size` | text | any `SIZE_OPTIONS` value (XS, S…XXXL, 4XL–8XL), or `FREE` for unsized items (sarees, unstitched, dupattas) |
| `quantity` | int, CHECK >= 0 | |
| `updated_at` | timestamptz | |

`UNIQUE (product_id, size)`, index on `retailer_id`.

- `kanchuki_app` has DELETE revoked platform-wide (RC-049). **Decision (owner, 2026-10-24): removing a size writes quantity 0; no DELETE grant.**
- `products.status` stays the source of truth for visibility. Rule: if a product has stock rows and the total is 0 -> `SOLD`; total goes above 0 on a `SOLD` product -> `AVAILABLE`. A product with no stock rows is "not tracked" and behaves exactly as today, so existing products are unaffected and need no backfill.

## 3. API

- `POST /products` and `PATCH /products/:id` (`products-crud.ts`) accept `stock: [{ size, quantity }]`. Validate: size in the allowed set and in the product's `sizes` (or `FREE`), integer 0..99999.
- Default: when a product is created with sizes and no `stock`, create one row per selected size with quantity 1. Bulk onboarding (F-001d) and supplier PDF import go through the same default.
- Product list/detail responses include `stock` and a `total_quantity`.
- Customer-facing public endpoints: no stock fields in v1 (no "only N left").

## 4. Mobile

- Add/edit product: per selected size, a small stepper (default 1) under the sizes checkboxes. Unsized categories get one "Quantity" stepper.
- Product detail: editable stock row; "Mark sold" sets all to 0.
- Catalog list: low-stock badge (total <= 2) for the retailer only.

## 5. Out of scope (future "sell online" project)

Cart/checkout/orders (removed 2026-08-31), reservation holds, GST invoice on sale, WhatsApp catalog `inventory` sync (the Meta catalog field exists, can be fed from `total_quantity` later).

## 6. Docs to touch when built

`docs/DATABASE.md` (check first, per project rule), `docs/PRO-REQUIREMENTS.md` (new F-number), `docs/BUILD-LOG.md`, CLAUDE.md index row.

## 7. Estimate

~2 days: migration + RLS + grant (owner applies), API + tests, mobile UI, bulk-import default.

## 8. Build notes (2026-10-24)

- API: `lib/product-stock.ts` (schema, `defaultStock`, `writeStock` in one transaction, `zeroStock`), wired into `products-crud.ts` (POST default 1/size, PUT replace-semantics, GET list/detail return `stock` + `total_quantity`, PATCH status SOLD zeroes stock) and `catalog-import.ts` (default 1 per size, covers bulk onboarding).
- Mobile: `StockEditor` on add-product and product detail; catalog card shows `Stock: N` / `Low stock: N` (<= 2). Edit form sends `stock` only after the retailer touches it, so saving an old untracked or SOLD product never silently re-lists it.
- Not covered: PDF/CSV import paths other than `catalog-import.ts` (none found creating products); customer pages show no stock; WhatsApp catalog `inventory` not fed yet.
- Owner steps: new EAS build, then device-test add product (default 1 per size), edit counts, mark sold, edit an old SOLD product's price without relisting it.
- Possible follow-ups: feed `total_quantity` to WhatsApp catalog `inventory`; customer-side "only N left"; decrement on sale once online selling exists.
