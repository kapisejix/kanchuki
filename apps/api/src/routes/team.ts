// Team routes aggregator — shared helpers in team/team-helpers.ts, domain
// modules in ./team/. Split via scripts/check-route-size.sh guard.
import type { FastifyPluginAsync } from 'fastify';
import {
  teamMembersRoutes,
  teamReportingRoutes,
  teamRetailersRoutes,
  teamSessionRoutes,
  teamTerritoriesRoutes,
  teamTicketsRoutes,
} from './team/index.js';

export { routeTicket } from './team/index.js';

export const teamRoutes: FastifyPluginAsync = async (server) => {
  // team-session — auto-split module
  await server.register(teamSessionRoutes);
  // team-territories — auto-split module
  await server.register(teamTerritoriesRoutes);
  // team-members — auto-split module
  await server.register(teamMembersRoutes);
  // team-retailers — auto-split module
  await server.register(teamRetailersRoutes);
  // team-tickets — auto-split module
  await server.register(teamTicketsRoutes);
  // team-reporting — auto-split module
  await server.register(teamReportingRoutes);
};
