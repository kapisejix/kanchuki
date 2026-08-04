// Auto-split from admin-settings.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminAuthPreHandler } from '../admin.js';

export const adminDeploymentsRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  server.get('/deployments', async (request) => {
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        status: z.string().max(50).optional(),
      })
      .safeParse(request.query);

    const { cursor, limit, status } = query.success
      ? query.data
      : { cursor: undefined, limit: 50, status: undefined };

    const where: Record<string, unknown> = {
      action: { startsWith: 'DEPLOY' },
      resource_type: 'Deployment',
    };
    if (cursor) where.id = { lt: cursor };
    if (status) where.metadata = { path: ['status'], equals: status };

    const deployments = await prisma.auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        action: true,
        metadata: true,
        ip_address: true,
        created_at: true,
      },
    });

    const hasMore = deployments.length > limit;
    const page = hasMore ? deployments.slice(0, limit) : deployments;

    return {
      data: page.map((d) => {
        const meta = d.metadata as Record<string, unknown> | null;
        return {
          id: d.id,
          action: d.action,
          service: (meta?.service as string) ?? 'unknown',
          commit_hash: (meta?.commit_hash as string) ?? null,
          commit_message: (meta?.commit_message as string) ?? null,
          author: (meta?.author as string) ?? null,
          status: (meta?.status as string) ?? 'unknown',
          duration_seconds: (meta?.duration_seconds as number) ?? null,
          ip_address: d.ip_address,
          created_at: d.created_at.toISOString(),
        };
      }),
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
      },
    };
  });

  // ─── POST /admin/deployments ─────────────────────────────────────
  // Log a deployment (called by CI/CD or manually).
  server.post('/deployments', async (request) => {
    const body = z
      .object({
        service: z.string().min(1).max(100),
        commit_hash: z.string().max(64).optional(),
        commit_message: z.string().max(500).optional(),
        author: z.string().max(200).optional(),
        status: z.enum(['pending', 'running', 'success', 'failed', 'rolled_back']),
        duration_seconds: z.number().optional(),
      })
      .parse(request.body);

    const entry = await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action:
          body.status === 'pending'
            ? 'DEPLOY_PENDING'
            : body.status === 'success'
              ? 'DEPLOY_SUCCESS'
              : body.status === 'failed'
                ? 'DEPLOY_FAILED'
                : 'DEPLOY_RUNNING',
        resource_type: 'Deployment',
        metadata: {
          service: body.service,
          commit_hash: body.commit_hash ?? null,
          commit_message: body.commit_message ?? null,
          author: body.author ?? null,
          status: body.status,
          duration_seconds: body.duration_seconds ?? null,
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ deployment_id: entry.id, service: body.service }, 'Deployment logged');
    return { data: { id: entry.id } };
  });

  // ─── Deployment Gate Check ──────────────────────────────────────
  // Validates pre-deployment conditions (approval gates). Called by CI/CD
  // before proceeding with a deployment. All gates must pass to deploy.
  server.get('/deployment-gate/check', async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

    // Gate 1: No pending operations that haven't been reviewed
    const pendingOps = await prisma.auditLog.count({
      where: {
        action: { startsWith: 'PENDING_' },
        resource_type: 'AdminOperation',
        created_at: { gte: sevenDaysAgo },
      },
    });

    // Gate 2: No recent failed deployments
    const recentFailedDeployments = await prisma.auditLog.count({
      where: {
        action: 'DEPLOY_FAILED',
        resource_type: 'Deployment',
        created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    // Gate 3: At least one successful backup in the last 24h
    const recentBackup = await prisma.auditLog.findFirst({
      where: {
        action: 'SCHEDULED_BACKUP',
        resource_type: 'DatabaseBackup',
        created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    // Gate 4: No integrity check failures in last 7 days
    const integrityFailures = await prisma.auditLog.count({
      where: {
        action: 'INTEGRITY_FAILURE_ALERT',
        created_at: { gte: sevenDaysAgo },
      },
    });

    const gates = [
      {
        name: 'pending_operations',
        description: 'No pending operations awaiting review',
        passed: pendingOps === 0,
        details:
          pendingOps > 0 ? `${pendingOps} operation(s) pending review` : 'No pending operations',
      },
      {
        name: 'no_recent_failures',
        description: 'No failed deployments in last 24h',
        passed: recentFailedDeployments === 0,
        details:
          recentFailedDeployments > 0
            ? `${recentFailedDeployments} failed deployment(s) in last 24h`
            : 'No recent failures',
      },
      {
        name: 'recent_backup',
        description: 'Successful backup in last 24h',
        passed: !!recentBackup,
        details: recentBackup ? 'Backup found' : 'No backup in last 24 hours',
      },
      {
        name: 'integrity_checks',
        description: 'No integrity failures in last 7 days',
        passed: integrityFailures === 0,
        details:
          integrityFailures > 0
            ? `${integrityFailures} integrity failure(s)`
            : 'All integrity checks passed',
      },
    ];

    const allPassed = gates.every((g) => g.passed);

    // Log the gate check result to audit log for history tracking
    await prisma.auditLog.create({
      data: {
        actor_type: 'system',
        action: allPassed ? 'GATE_CHECK_PASSED' : 'GATE_CHECK_FAILED',
        resource_type: 'Deployment',
        metadata: {
          result: allPassed ? 'passed' : 'failed',
          summary: allPassed
            ? 'All deployment gates passed — ready to deploy'
            : `${gates.filter((g) => !g.passed).length} gate(s) blocking deployment`,
          gates: gates.map((g) => ({ name: g.name, passed: g.passed, details: g.details })),
          checked_at: new Date().toISOString(),
        },
      },
    });

    return {
      data: {
        gates,
        all_passed: allPassed,
        checked_at: new Date().toISOString(),
        summary: allPassed
          ? 'All deployment gates passed — ready to deploy'
          : `${gates.filter((g) => !g.passed).length} gate(s) blocking deployment`,
      },
    };
  });

  // ─── GET /admin/deployment-gate/history ───────────────────────────
  // Recent gate check results for the operations dashboard.
  server.get('/deployment-gate/history', async () => {
    const checks = await prisma.auditLog.findMany({
      where: {
        action: { startsWith: 'GATE_CHECK_' },
        resource_type: 'Deployment',
      },
      orderBy: { created_at: 'desc' },
      take: 20,
      select: {
        action: true,
        metadata: true,
        created_at: true,
      },
    });

    return {
      data: checks.map((c) => {
        const meta = c.metadata as Record<string, unknown> | null;
        return {
          action: c.action,
          result: (meta?.result as string) ?? 'unknown',
          summary: (meta?.summary as string) ?? '',
          checked_at: c.created_at.toISOString(),
        };
      }),
    };
  });
};
