/**
 * Phase S + Phase 0.5: Admin settings, operations center, and reporting endpoints.
 *
 * Endpoints:
 *   GET/PUT /admin/settings/rate-limits    — Rate limit live tuning
 *   GET/PUT /admin/settings/ai-config      — AI model config per operation
 *   GET      /admin/operations/pending     — Pending operations requiring approval
 *   POST     /admin/operations/:id/approve — Approve a pending operation
 *   POST     /admin/operations/:id/reject  — Reject a pending operation
 *   GET      /admin/deployments            — Deployment log
 *   GET      /admin/reporting/tickets      — Support ticket reporting
 *   POST     /admin/notify/test            — Send test notification (backup alerts)
 */

import { execSync } from 'node:child_process';
import { type Prisma, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../plugins/error-handler.js';
import { adminAuthPreHandler } from './admin.js';

// ─── Rate Limit Config (in-memory with DB persistence) ─────────────
// Stored as a JSONB row in a new `admin_settings` key-value table.
// We use the existing prisma setup — but since there's no AdminSetting model,
// we store configs as JSON in audit_log metadata and use env vars as defaults.

const DEFAULT_RATE_LIMITS: Record<
  string,
  { window_ms: number; max_requests: number; description: string }
> = {
  'products:create': {
    window_ms: 60_000,
    max_requests: 60,
    description: 'Product creation per minute',
  },
  'products:upload': {
    window_ms: 60_000,
    max_requests: 20,
    description: 'File upload URLs per minute',
  },
  'ai:tag': { window_ms: 3_600_000, max_requests: 200, description: 'AI tagging calls per hour' },
  'collections:create': {
    window_ms: 60_000,
    max_requests: 30,
    description: 'Collection creation per minute',
  },
  'tryon:initiate': {
    window_ms: 3_600_000,
    max_requests: 50,
    description: 'Try-on initiations per hour',
  },
  'auth:otp': {
    window_ms: 900_000,
    max_requests: 3,
    description: 'OTP requests per 15min per phone',
  },
  'checkout:create': {
    window_ms: 60_000,
    max_requests: 10,
    description: 'Order creation per minute',
  },
  'webhook:razorpay': {
    window_ms: 60_000,
    max_requests: 30,
    description: 'Razorpay webhooks per minute',
  },
};

// In-memory cache (populated from audit log on first load)
let cachedRateLimits: Record<
  string,
  { window_ms: number; max_requests: number; description: string }
> | null = null;

const RATE_LIMIT_SETTING_KEY = 'rate_limits';
const AI_CONFIG_SETTING_KEY = 'ai_model_config';

const DEFAULT_AI_CONFIG: Record<
  string,
  { model: string; temperature: number; max_tokens: number; timeout_ms: number }
> = {
  product_tagging: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.1,
    max_tokens: 2000,
    timeout_ms: 30000,
  },
  embedding_generation: {
    model: 'text-embedding-3-small',
    temperature: 0,
    max_tokens: 0,
    timeout_ms: 15000,
  },
  try_on: { model: 'fashion-vtone-v1.5', temperature: 0, max_tokens: 0, timeout_ms: 120000 },
  color_detection: {
    model: 'claude-3-haiku-20240307',
    temperature: 0.1,
    max_tokens: 500,
    timeout_ms: 15000,
  },
  multi_item_detection: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.2,
    max_tokens: 3000,
    timeout_ms: 45000,
  },
  fashion_dna: {
    model: 'text-embedding-3-small',
    temperature: 0,
    max_tokens: 0,
    timeout_ms: 30000,
  },
};

// ─── Platform Theme (admin-editable brand color) ────────────────────
// Same audit-log-as-key-value-store pattern as rate limits / AI config
// above — no new Prisma model needed. Read by apps/web (CSS variable
// injected server-side) and apps/mobile (fetched at launch, see
// src/lib/theme.ts) so a color change doesn't need a new app build.
const THEME_SETTING_KEY = 'app_theme';

const DEFAULT_THEME: { primary_color: string } = {
  primary_color: '#14213D',
};

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

async function getSetting(key: string): Promise<Record<string, unknown> | null> {
  try {
    // Find the most recent audit log entry for this setting type
    const entry = await prisma.auditLog.findFirst({
      where: { action: `SETTING_${key}`, resource_type: 'AdminSetting' },
      orderBy: { created_at: 'desc' },
      select: { metadata: true },
    });
    return entry?.metadata as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

async function saveSetting(key: string, value: Record<string, unknown>): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actor_type: 'admin',
      action: `SETTING_${key}`,
      resource_type: 'AdminSetting',
      metadata: value as Prisma.InputJsonValue,
    },
  });
}

// ─── Route Registration ──────────────────────────────────────────

export const adminSettingsRoutes: FastifyPluginAsync = async (server) => {
  // Fastify preHandler hooks don't cross sibling-plugin boundaries even
  // under the same prefix — this plugin needs its own copy of admin.ts's
  // auth hook (IP allowlist + key/session + CSRF), not a comment assuming it.
  server.addHook('preHandler', adminAuthPreHandler);

  // ═══════════════════════════════════════════════════════════════
  //  Rate Limit Live Tuning
  // ═══════════════════════════════════════════════════════════════

  server.get('/settings/rate-limits', async () => {
    const saved = await getSetting(RATE_LIMIT_SETTING_KEY);
    const limits = saved as Record<
      string,
      { window_ms: number; max_requests: number; description: string }
    > | null;

    const merged: Record<
      string,
      { window_ms: number; max_requests: number; description: string; is_default: boolean }
    > = {};
    for (const [key, def] of Object.entries(DEFAULT_RATE_LIMITS)) {
      const savedVal = limits?.[key];
      merged[key] = {
        window_ms: savedVal?.window_ms ?? def.window_ms,
        max_requests: savedVal?.max_requests ?? def.max_requests,
        description: def.description,
        is_default: !savedVal,
      };
    }
    return { data: merged };
  });

  server.put('/settings/rate-limits', async (request) => {
    const body = z
      .object({
        limits: z.record(
          z.string(),
          z.object({
            window_ms: z.number().int().min(1000).max(86400000),
            max_requests: z.number().int().min(1).max(10000),
          }),
        ),
      })
      .parse(request.body);

    // Validate keys exist in defaults
    for (const key of Object.keys(body.limits)) {
      if (!DEFAULT_RATE_LIMITS[key]) {
        throw validationError(`Unknown rate limit key: ${key}`);
      }
    }

    // Merge with defaults to preserve descriptions
    const merged: Record<string, { window_ms: number; max_requests: number; description: string }> =
      {};
    for (const [key, def] of Object.entries(DEFAULT_RATE_LIMITS)) {
      if (body.limits[key]) {
        merged[key] = { ...body.limits[key], description: def.description };
      } else {
        merged[key] = def;
      }
    }

    await saveSetting(RATE_LIMIT_SETTING_KEY, merged as unknown as Record<string, unknown>);
    cachedRateLimits = merged;

    request.log.info('Rate limits updated');
    return { data: merged };
  });

  /**
   * Get effective rate limit for a given endpoint key.
   * Called by the rate limiter middleware at startup.
   */
  server.get('/settings/rate-limits/:key', async (request) => {
    const { key } = z.object({ key: z.string() }).parse(request.params);
    const saved = await getSetting(RATE_LIMIT_SETTING_KEY);
    const limits = saved as Record<string, { window_ms: number; max_requests: number }> | null;

    if (limits?.[key]) {
      return { data: limits[key] };
    }
    if (DEFAULT_RATE_LIMITS[key]) {
      return { data: DEFAULT_RATE_LIMITS[key] };
    }
    throw notFound(`Rate limit '${key}' not found`);
  });

  // ═══════════════════════════════════════════════════════════════
  //  Platform Theme
  // ═══════════════════════════════════════════════════════════════

  server.get('/settings/theme', async () => {
    const data = await getTheme();
    return { data };
  });

  server.put('/settings/theme', async (request) => {
    const body = z
      .object({
        primary_color: z.string().regex(HEX_COLOR_RE, 'Must be a 6-digit hex color like #1E2A3D'),
      })
      .parse(request.body);

    await saveSetting(THEME_SETTING_KEY, body);
    request.log.info({ primary_color: body.primary_color }, 'Platform theme updated');

    return { data: body };
  });

  // ═══════════════════════════════════════════════════════════════
  //  AI Model Configuration
  // ═══════════════════════════════════════════════════════════════

  server.get('/settings/ai-config', async () => {
    const saved = await getSetting(AI_CONFIG_SETTING_KEY);
    const config = saved as Record<
      string,
      { model: string; temperature: number; max_tokens: number; timeout_ms: number }
    > | null;

    const merged: Record<
      string,
      {
        model: string;
        temperature: number;
        max_tokens: number;
        timeout_ms: number;
        is_default: boolean;
      }
    > = {};
    for (const [key, def] of Object.entries(DEFAULT_AI_CONFIG)) {
      const savedVal = config?.[key];
      merged[key] = {
        model: savedVal?.model ?? def.model,
        temperature: savedVal?.temperature ?? def.temperature,
        max_tokens: savedVal?.max_tokens ?? def.max_tokens,
        timeout_ms: savedVal?.timeout_ms ?? def.timeout_ms,
        is_default: !savedVal,
      };
    }
    return { data: merged };
  });

  server.put('/settings/ai-config', async (request) => {
    const body = z
      .object({
        configs: z.record(
          z.string(),
          z.object({
            model: z.string().min(1).max(200),
            temperature: z.number().min(0).max(2),
            max_tokens: z.number().int().min(0).max(100000),
            timeout_ms: z.number().int().min(1000).max(600000),
          }),
        ),
      })
      .parse(request.body);

    for (const key of Object.keys(body.configs)) {
      if (!DEFAULT_AI_CONFIG[key]) {
        throw validationError(`Unknown AI config key: ${key}`);
      }
    }

    const merged: Record<
      string,
      { model: string; temperature: number; max_tokens: number; timeout_ms: number }
    > = {};
    for (const [key, def] of Object.entries(DEFAULT_AI_CONFIG)) {
      merged[key] = body.configs[key] ?? def;
    }

    await saveSetting(AI_CONFIG_SETTING_KEY, merged as unknown as Record<string, unknown>);
    request.log.info('AI model config updated');

    return { data: merged };
  });

  // ═══════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════
  //  Operations Approval Center
  // ═══════════════════════════════════════════════════════════════

  /** Operation types that can be pending approval */
  const OPERATION_TYPES = [
    'DEPLOYMENT',
    'BACKUP_RESTORE',
    'BULK_ACTION',
    'CONFIG_CHANGE',
    'DATA_EXPORT',
    'MIGRATION',
  ] as const;

  server.get('/operations/pending', async () => {
    // Find audit log entries that represent pending operations
    // (those with action containing 'PENDING_')
    const pendingOps = await prisma.auditLog.findMany({
      where: {
        action: { startsWith: 'PENDING_' },
        created_at: { gte: new Date(Date.now() - 7 * 86400000) }, // Last 7 days
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    return {
      data: pendingOps.map((op) => ({
        id: op.id,
        type: op.action.replace('PENDING_', ''),
        description: ((op.metadata as Record<string, unknown>)?.description as string) ?? op.action,
        requested_by: op.actor_id ?? 'unknown',
        requested_at: op.created_at.toISOString(),
        metadata: op.metadata,
      })),
    };
  });

  server.post('/operations/:id/approve', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ note: z.string().max(500).optional() }).parse(request.body);

    const pending = await prisma.auditLog.findUnique({ where: { id } });
    if (!pending) throw notFound('Pending operation');
    if (!pending.action.startsWith('PENDING_')) {
      throw validationError('Operation is not in pending state');
    }

    // Log the approval
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: `APPROVED_${pending.action.replace('PENDING_', '')}`,
        resource_type: 'AdminOperation',
        resource_id: id,
        metadata: {
          original_action: pending.action,
          original_metadata: pending.metadata,
          note: body.note ?? null,
          approved_at: new Date().toISOString(),
        },
        ip_address: request.ip,
      },
    });

    // Update the original pending entry
    await prisma.auditLog.update({
      where: { id },
      data: {
        metadata: {
          ...((pending.metadata as Record<string, unknown>) ?? {}),
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: request.ip,
        },
      },
    });

    request.log.info({ operation_id: id }, 'Operation approved');
    return { data: { status: 'approved', id } };
  });

  server.post('/operations/:id/reject', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().min(1).max(1000) }).parse(request.body);

    const pending = await prisma.auditLog.findUnique({ where: { id } });
    if (!pending) throw notFound('Pending operation');
    if (!pending.action.startsWith('PENDING_')) {
      throw validationError('Operation is not in pending state');
    }

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: `REJECTED_${pending.action.replace('PENDING_', '')}`,
        resource_type: 'AdminOperation',
        resource_id: id,
        metadata: {
          original_action: pending.action,
          original_metadata: pending.metadata,
          reason: body.reason,
          rejected_at: new Date().toISOString(),
        },
        ip_address: request.ip,
      },
    });

    await prisma.auditLog.update({
      where: { id },
      data: {
        metadata: {
          ...((pending.metadata as Record<string, unknown>) ?? {}),
          status: 'rejected',
          rejected_at: new Date().toISOString(),
          rejected_by: request.ip,
          rejection_reason: body.reason,
        },
      },
    });

    request.log.info({ operation_id: id }, 'Operation rejected');
    return { data: { status: 'rejected', id } };
  });

  // ─── POST /admin/operations/request ─────────────────────────────
  // Utility endpoint to create a pending operation (used by scripts).
  server.post('/operations/request', async (request) => {
    const body = z
      .object({
        type: z.enum(OPERATION_TYPES),
        description: z.string().min(1).max(1000),
        metadata: z.record(z.unknown()).optional(),
      })
      .parse(request.body);

    const entry = await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: `PENDING_${body.type}`,
        resource_type: 'AdminOperation',
        metadata: {
          description: body.description,
          ...(body.metadata ?? {}),
          status: 'pending',
          created_at: new Date().toISOString(),
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ operation_id: entry.id, type: body.type }, 'Pending operation created');
    return { data: { id: entry.id, status: 'pending' } };
  });

  // ═══════════════════════════════════════════════════════════════
  //  Deployment Log
  // ═══════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════
  //  Deployment Gate Check
  // ═══════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════
  //  Support Ticket Reporting (Phase 0.5)
  // ═══════════════════════════════════════════════════════════════

  server.get('/reporting/tickets', async (request) => {
    const query = z
      .object({
        days: z.coerce.number().int().min(1).max(365).default(30),
      })
      .safeParse(request.query);

    const days = query.success ? query.data.days : 30;
    const since = new Date(Date.now() - days * 86400000);

    const [totalTickets, byStatus, byAgent, byDay, visitRequired] = await Promise.all([
      prisma.supportTicket.count({ where: { created_at: { gte: since } } }),
      prisma.supportTicket.groupBy({
        by: ['status'],
        where: { created_at: { gte: since } },
        _count: true,
      }),
      prisma.supportTicket.groupBy({
        by: ['assigned_to_id'],
        where: { created_at: { gte: since }, assigned_to_id: { not: null } },
        _count: true,
      }),
      // Group by day (approximate — use a raw query or handle in-memory)
      prisma.supportTicket.findMany({
        where: { created_at: { gte: since } },
        select: { created_at: true },
        orderBy: { created_at: 'asc' },
      }),
      prisma.supportTicket.count({
        where: { created_at: { gte: since }, requires_visit: true },
      }),
    ]);

    // Count by day
    const byDayMap = new Map<string, number>();
    for (const ticket of byDay) {
      const day = ticket.created_at.toISOString().slice(0, 10);
      byDayMap.set(day, (byDayMap.get(day) ?? 0) + 1);
    }

    // Resolve agent names
    const agentIds = byAgent.map((a) => a.assigned_to_id).filter(Boolean) as string[];
    const agents = agentIds.length
      ? await prisma.teamMember.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, name: true },
        })
      : [];
    const agentMap = new Map(agents.map((a) => [a.id, a.name]));

    return {
      data: {
        total: totalTickets,
        requires_visit: visitRequired,
        by_status: byStatus.map((s) => ({ status: s.status, count: s._count })),
        by_agent: byAgent.map((a) => ({
          agent_id: a.assigned_to_id,
          agent_name: agentMap.get(a.assigned_to_id ?? '') ?? 'Unknown',
          count: a._count,
        })),
        by_day: Array.from(byDayMap.entries()).map(([date, count]) => ({ date, count })),
        resolution_rate:
          totalTickets > 0
            ? Math.round(
                (((byStatus.find((s) => s.status === 'RESOLVED')?._count ?? 0) +
                  (byStatus.find((s) => s.status === 'CLOSED')?._count ?? 0)) /
                  totalTickets) *
                  100,
              )
            : 0,
      },
    };
  });

  // ═══════════════════════════════════════════════════════════════
  //  Backup Alerts & Notification
  // ═══════════════════════════════════════════════════════════════

  // ─── GET /admin/backups/status ────────────────────────────────────
  // Quick backup health summary for the admin dashboard.
  server.get('/backups/status', async () => {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7d = new Date(Date.now() - 7 * 86400000);

    const [recentBackups, lastFailure, totalBackups] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          action: { in: ['SCHEDULED_BACKUP', 'SCHEDULED_BACKUP_FAILED'] },
          resource_type: 'DatabaseBackup',
          created_at: { gte: last24h },
        },
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { action: true, created_at: true, metadata: true },
      }),
      prisma.auditLog.findFirst({
        where: {
          action: 'SCHEDULED_BACKUP_FAILED',
          resource_type: 'DatabaseBackup',
          created_at: { gte: last7d },
        },
        orderBy: { created_at: 'desc' },
        select: { created_at: true, metadata: true },
      }),
      prisma.auditLog.count({
        where: { action: 'SCHEDULED_BACKUP', resource_type: 'DatabaseBackup' },
      }),
    ]);

    const lastSuccess = recentBackups.find((b) => b.action === 'SCHEDULED_BACKUP');
    const lastSuccessMeta = lastSuccess?.metadata as Record<string, unknown> | null;

    return {
      data: {
        total_backups: totalBackups,
        last_24h: {
          attempts: recentBackups.length,
          success_count: recentBackups.filter((b) => b.action === 'SCHEDULED_BACKUP').length,
          failure_count: recentBackups.filter((b) => b.action === 'SCHEDULED_BACKUP_FAILED').length,
        },
        last_successful: lastSuccess
          ? {
              time: lastSuccess.created_at.toISOString(),
              r2_key: (lastSuccessMeta?.r2_key as string) ?? null,
              size_bytes: (lastSuccessMeta?.compressed_size_bytes as number) ?? null,
              integrity_verified: (lastSuccessMeta?.integrity_verified as boolean) ?? false,
            }
          : null,
        last_failure: lastFailure
          ? {
              time: lastFailure.created_at.toISOString(),
              error:
                ((lastFailure.metadata as Record<string, unknown>)?.error as string) ?? 'Unknown',
            }
          : null,
        docker_available: (() => {
          try {
            execSync('docker --version', { stdio: 'pipe', timeout: 3000 });
            return true;
          } catch {
            return false;
          }
        })(),
      },
    };
  });

  // ═══════════════════════════════════════════════════════════════
  //  Notification Preferences
  // ═══════════════════════════════════════════════════════════════

  const NOTIFICATION_SETTING_KEY = 'notification_preferences';

  const DEFAULT_NOTIFICATION_PREFERENCES: {
    backup_failure: { enabled: boolean; channels: ('admin_bell' | 'email')[] };
    consecutive_failures: { enabled: boolean; threshold: number };
    integrity_failure: { enabled: boolean };
  } = {
    backup_failure: { enabled: true, channels: ['admin_bell'] },
    consecutive_failures: { enabled: true, threshold: 2 },
    integrity_failure: { enabled: true },
  };

  // ─── GET /admin/settings/notifications ─────────────────────────────
  server.get('/settings/notifications', async () => {
    const saved = await getSetting(NOTIFICATION_SETTING_KEY);
    const preferences = saved as Record<string, unknown> | null;

    // Merge saved with defaults so new fields always appear
    const merged = {
      backup_failure: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.backup_failure,
        ...((preferences?.backup_failure as Record<string, unknown>) ?? {}),
      },
      consecutive_failures: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.consecutive_failures,
        ...((preferences?.consecutive_failures as Record<string, unknown>) ?? {}),
      },
      integrity_failure: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.integrity_failure,
        ...((preferences?.integrity_failure as Record<string, unknown>) ?? {}),
      },
      // Status summary for the UI
      last_alert: null as { time: string; type: string; message: string } | null,
      consecutive_failures_count: 0,
    };

    // Fetch latest alert for dashboard context
    const [lastAlert, recentBackupEntries] = await Promise.all([
      prisma.auditLog.findFirst({
        where: {
          action: { in: ['BACKUP_FAILURE_ALERT', 'INTEGRITY_FAILURE_ALERT'] },
          resource_type: 'Notification',
        },
        orderBy: { created_at: 'desc' },
        select: { created_at: true, action: true, metadata: true },
      }),
      prisma.auditLog.findMany({
        where: {
          action: {
            in: [
              'SCHEDULED_BACKUP',
              'SCHEDULED_BACKUP_FAILED',
              'WEEKLY_BACKUP',
              'WEEKLY_BACKUP_FAILED',
            ],
          },
          resource_type: 'DatabaseBackup',
        },
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { action: true },
      }),
    ]);

    if (lastAlert) {
      const meta = lastAlert.metadata as Record<string, unknown> | null;
      merged.last_alert = {
        time: lastAlert.created_at.toISOString(),
        type: lastAlert.action,
        message: (meta?.message as string) ?? 'No details',
      };
    }

    // Count consecutive failures
    let consecutiveFailures = 0;
    for (const entry of recentBackupEntries) {
      if (entry.action.endsWith('_FAILED')) consecutiveFailures++;
      else break;
    }
    merged.consecutive_failures_count = consecutiveFailures;

    return { data: merged };
  });

  // ─── PUT /admin/settings/notifications ─────────────────────────────
  server.put('/settings/notifications', async (request) => {
    const body = z
      .object({
        backup_failure: z
          .object({
            enabled: z.boolean(),
            channels: z
              .array(z.enum(['admin_bell', 'email']))
              .min(1)
              .max(5),
          })
          .optional(),
        consecutive_failures: z
          .object({
            enabled: z.boolean(),
            threshold: z.number().int().min(1).max(10),
          })
          .optional(),
        integrity_failure: z
          .object({
            enabled: z.boolean(),
          })
          .optional(),
      })
      .parse(request.body);

    // Load existing preferences to merge (not replace)
    const saved = await getSetting(NOTIFICATION_SETTING_KEY);
    const existing = (saved ?? {}) as Record<string, unknown>;

    const merged = {
      backup_failure: body.backup_failure
        ? { ...DEFAULT_NOTIFICATION_PREFERENCES.backup_failure, ...body.backup_failure }
        : (existing.backup_failure ?? DEFAULT_NOTIFICATION_PREFERENCES.backup_failure),
      consecutive_failures: body.consecutive_failures
        ? { ...DEFAULT_NOTIFICATION_PREFERENCES.consecutive_failures, ...body.consecutive_failures }
        : (existing.consecutive_failures ?? DEFAULT_NOTIFICATION_PREFERENCES.consecutive_failures),
      integrity_failure: body.integrity_failure
        ? { ...DEFAULT_NOTIFICATION_PREFERENCES.integrity_failure, ...body.integrity_failure }
        : (existing.integrity_failure ?? DEFAULT_NOTIFICATION_PREFERENCES.integrity_failure),
    };

    await saveSetting(NOTIFICATION_SETTING_KEY, merged as unknown as Record<string, unknown>);

    request.log.info('Notification preferences updated');
    return { data: merged };
  });

  // ─── GET /admin/alerts ────────────────────────────────────────────
  // Recent system alerts for the admin header bell dropdown.
  server.get('/alerts', async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

    const alerts = await prisma.auditLog.findMany({
      where: {
        action: { in: ['BACKUP_FAILURE_ALERT', 'INTEGRITY_FAILURE_ALERT', 'NOTIFY_TEST'] },
        resource_type: 'Notification',
        created_at: { gte: sevenDaysAgo },
      },
      orderBy: { created_at: 'desc' },
      take: 20,
      select: {
        id: true,
        action: true,
        metadata: true,
        created_at: true,
      },
    });

    return {
      data: alerts.map((a) => {
        const meta = a.metadata as Record<string, unknown> | null;
        return {
          id: a.id,
          type: a.action,
          message: (meta?.message as string) ?? a.action,
          severity: (meta?.severity as string) ?? 'info',
          time: a.created_at.toISOString(),
        };
      }),
    };
  });

  // ─── POST /admin/notify/test ─────────────────────────────────────
  // Send a test notification to verify alert channels are working.
  server.post('/notify/test', async (request) => {
    // Log the test notification — actual SMS/email sending
    // would require a notification service hook (Phase 2).
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'NOTIFY_TEST',
        resource_type: 'Notification',
        metadata: {
          message: 'Test notification from admin panel',
          severity: 'info',
          timestamp: new Date().toISOString(),
        },
        ip_address: request.ip,
      },
    });

    request.log.info('Test notification sent');
    return {
      data: {
        status: 'logged',
        message: 'Test notification logged. Configure SMS/email provider for actual delivery.',
      },
    };
  });
};

/**
 * Get cached rate limits for use by the rate limiter middleware.
 */
export function getCachedRateLimits(): Record<
  string,
  { window_ms: number; max_requests: number; description: string }
> {
  return cachedRateLimits ?? DEFAULT_RATE_LIMITS;
}

export { DEFAULT_RATE_LIMITS, DEFAULT_AI_CONFIG };

/**
 * Get the current platform theme (falls back to DEFAULT_THEME).
 * Used by the public /v1/public/theme route — no admin auth needed to read it.
 */
export async function getTheme(): Promise<{ primary_color: string }> {
  const saved = await getSetting(THEME_SETTING_KEY);
  const primary_color = (saved?.primary_color as string | undefined) ?? DEFAULT_THEME.primary_color;
  return { primary_color };
}
