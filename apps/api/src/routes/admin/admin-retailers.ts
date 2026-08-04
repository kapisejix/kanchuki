// Auto-split from admin.ts (scripts/split-admin-routes.mjs) — further split via
// scripts/check-route-size.sh into ./admin-retailers/ domain modules.
import type { FastifyPluginAsync } from 'fastify';
import {
  adminRetailersDetailRoutes,
  adminRetailersListRoutes,
  adminRetailersManagementRoutes,
} from './admin-retailers/index.js';

export const adminRetailersRoutes: FastifyPluginAsync = async (server) => {
  // admin-retailers-list — auto-split module
  await server.register(adminRetailersListRoutes);
  // admin-retailers-detail — auto-split module
  await server.register(adminRetailersDetailRoutes);
  // admin-retailers-management — auto-split module
  await server.register(adminRetailersManagementRoutes);
};
