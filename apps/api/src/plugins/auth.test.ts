import { describe, expect, it } from 'vitest';
import { staffCanAccess } from './auth.js';

// A retailer-added team member (Staff row) gets a retailer-scoped token but
// must be limited to: products, categories, collections, size charts,
// creating new customers, and reading/QR-ing the shop profile. Everything
// else (billing, KYC, staff mgmt, account deletion, admin, ...) is owner-only.
// Note: /v1/products/deleted, /:id/restore and /:id/purge match the
// '/v1/products' prefix here (staff need product access) — those three are
// further restricted to owners inside the route handler itself
// (request.staffRole !== null check in products.ts), a separate layer.
describe('staffCanAccess', () => {
  it.each([
    ['GET', '/v1/products'],
    ['POST', '/v1/products'],
    ['PATCH', '/v1/products/prod_1'],
    ['DELETE', '/v1/products/prod_1'],
    ['GET', '/v1/categories'],
    ['POST', '/v1/collections'],
    ['PATCH', '/v1/size-charts/chart_1'],
    ['GET', '/v1/retailers/me'],
    ['POST', '/v1/retailers/me/qr-slug'],
  ])('allows %s %s', (method, path) => {
    expect(staffCanAccess(method, path)).toBe(true);
  });

  it.each([
    ['GET', '/v1/customers'], // list — only create is allowed
    ['PATCH', '/v1/customers/cust_1'],
    ['DELETE', '/v1/customers/cust_1'],
    ['PUT', '/v1/retailers/me'], // profile edit — owner only
    ['POST', '/v1/retailers/me/kyc-upload-url'],
    ['GET', '/v1/staff'], // team management itself
    ['POST', '/v1/staff'],
    ['GET', '/v1/billing'],
    ['DELETE', '/v1/retailers/me'],
    ['GET', '/v1/admin/stats'],
  ])('blocks %s %s', (method, path) => {
    expect(staffCanAccess(method, path)).toBe(false);
  });

  it('POST /v1/customers is allowed but not sub-paths', () => {
    expect(staffCanAccess('POST', '/v1/customers')).toBe(true);
    expect(staffCanAccess('POST', '/v1/customers/cust_1/favorites')).toBe(false);
  });

  it('manager gets the same access as an unspecified staff role', () => {
    expect(staffCanAccess('POST', '/v1/products', 'manager')).toBe(true);
    expect(staffCanAccess('POST', '/v1/categories', 'manager')).toBe(true);
  });

  it.each([
    ['GET', '/v1/products'],
    ['GET', '/v1/categories'],
    ['POST', '/v1/customers'],
    ['GET', '/v1/retailers/me'],
  ])('salesperson allows %s %s', (method, path) => {
    expect(staffCanAccess(method, path, 'salesperson')).toBe(true);
  });

  it.each([
    ['POST', '/v1/products'], // add product — manager only
    ['PATCH', '/v1/products/prod_1'], // edit product
    ['DELETE', '/v1/products/prod_1'],
    ['POST', '/v1/categories'], // add category
    ['PATCH', '/v1/categories/cat_1'],
    ['DELETE', '/v1/categories/cat_1'],
    ['POST', '/v1/collections'], // no collections at all
    ['PATCH', '/v1/size-charts/chart_1'], // no size charts at all
    ['POST', '/v1/retailers/me/qr-slug'], // manager only
  ])('salesperson blocks %s %s', (method, path) => {
    expect(staffCanAccess(method, path, 'salesperson')).toBe(false);
  });
});
