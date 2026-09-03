// Retailer-facing bug report submission — POST /retailers/me/bug-reports.
// Auto-captures device context, accepts optional screenshot upload.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validationError } from '../../plugins/error-handler.js';

const BugReportCreateSchema = z.object({
  description: z.string().min(10, 'Please describe the issue in a bit more detail').max(5000),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().default('MEDIUM'),
  // Auto-captured by the mobile app
  app_version: z.string().max(200).optional(),
  os_version: z.string().max(200).optional(),
  device_model: z.string().max(500).optional(),
  screen_name: z.string().max(200).optional(),
  last_screen: z.string().max(200).optional(),
  error_message: z.string().max(5000).optional(),
  error_stack: z.string().max(20000).optional(),
  // Optional screenshot
  screenshot_url: z.string().max(1000).optional(),
  screenshot_r2_key: z.string().max(1000).optional(),
  // Retailer's own additional notes
  notes: z.string().max(5000).optional(),
});

export const retailersBugReportRoutes: FastifyPluginAsync = async (server) => {
  // ── POST /retailers/me/bug-reports ────────────────────────────────
  // Submit a bug report from the mobile app. Authenticated retailer only.
  server.post('/me/bug-reports', async (request, reply) => {
    const body = BugReportCreateSchema.safeParse(request.body);
    if (!body.success) {
      throw validationError(body.error.issues[0]?.message ?? 'Invalid bug report');
    }

    const report = await prisma.bugReport.create({
      data: {
        retailer_id: request.retailerId!,
        description: body.data.description,
        severity: body.data.severity,
        app_version: body.data.app_version,
        os_version: body.data.os_version,
        device_model: body.data.device_model,
        screen_name: body.data.screen_name,
        last_screen: body.data.last_screen,
        error_message: body.data.error_message,
        error_stack: body.data.error_stack,
        screenshot_url: body.data.screenshot_url,
        screenshot_r2_key: body.data.screenshot_r2_key,
        notes: body.data.notes,
      },
      select: {
        id: true,
        status: true,
        created_at: true,
      },
    });

    request.log.info(
      {
        report_id: report.id,
        retailer_id: request.retailerId,
        severity: body.data.severity,
        screen: body.data.screen_name,
      },
      'Bug report submitted',
    );

    reply.code(201);
    return { data: report };
  });
};
