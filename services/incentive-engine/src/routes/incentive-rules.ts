// src/routes/incentive-rules.ts
import { FastifyInstance } from 'fastify';
import { prisma } from '@kanchuki/db';

export default async function (fastify: FastifyInstance) {
  // Validate incentive rule data
  const validateIncentiveRule = (data: any) => {
    const errors: string[] = [];

    if (!data.retailerId) {
      errors.push('retailerId is required');
    }
    if (!data.name || data.name.trim() === '') {
      errors.push('name is required');
    }
    if (!data.trigger_type) {
      errors.push('trigger_type is required');
    } else if (!['FIRST_VISIT', 'BIRTHDAY', 'ANNIVERSARY', 'LOYALTY_TIER'].includes(data.trigger_type)) {
      errors.push('trigger_type must be one of: FIRST_VISIT, BIRTHDAY, ANNIVERSARY, LOYALTY_TIER');
    }
    if (!data.discount_type) {
      errors.push('discount_type is required');
    } else if (!['PERCENT', 'FIXED_AMOUNT'].includes(data.discount_type)) {
      errors.push('discount_type must be one of: PERCENT, FIXED_AMOUNT');
    }
    if (data.discount_value === undefined || data.discount_value === null) {
      errors.push('discount_value is required');
    } else if (typeof data.discount_value !== 'number' || data.discount_value < 0) {
      errors.push('discount_value must be a non-negative number');
    } else if (data.discount_type === 'PERCENT' && data.discount_value > 100) {
      errors.push('discount_value for PERCENT type should not exceed 100');
    }

    // Validate date range if both are provided
    if (data.starts_at && data.ends_at) {
      const startDate = new Date(data.starts_at);
      const endDate = new Date(data.ends_at);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        errors.push('starts_at and ends_at must be valid date strings');
      } else if (startDate > endDate) {
        errors.push('starts_at must be before ends_at');
      }
    }

    return errors;
  };

  // Create a new incentive rule
  fastify.post('/', async (request, reply) => {
    const {
      retailerId,
      name,
      description,
      trigger_type,
      discount_type,
      discount_value,
      conditions,
      starts_at,
      ends_at
    } = request.body as {
      retailerId: string;
      name: string;
      description?: string;
      trigger_type: 'FIRST_VISIT' | 'BIRTHDAY' | 'ANNIVERSARY' | 'LOYALTY_TIER';
      discount_type: 'PERCENT' | 'FIXED_AMOUNT';
      discount_value: number; // in paise for FIXED_AMOUNT, or percentage for PERCENT
      conditions?: any; // JSON object, e.g., { min_spent: 10000, min_visits: 5 }
      starts_at?: string; // ISO date string
      ends_at?: string;   // ISO date string
    };

    // Validate input
    const validationErrors = validateIncentiveRule({
      retailerId,
      name,
      trigger_type,
      discount_type,
      discount_value,
      starts_at,
      ends_at
    });

    if (validationErrors.length > 0) {
      return reply.status(400).send({ error: 'Validation failed', details: validationErrors });
    }

    try {
      // Check if retailer exists
      const retailer = await prisma.retailer.findUnique({ where: { id: retailerId } });
      if (!retailer) {
        return reply.status(404).send({ error: 'Retailer not found' });
      }

      // Create incentive rule
      const rule = await prisma.incentiveRule.create({
        data: {
          retailer: { connect: { id: retailerId } },
          name,
          description,
          trigger_type,
          discount_type,
          discount_value,
          conditions: conditions ?? undefined,
          starts_at: starts_at ? new Date(starts_at) : undefined,
          ends_at: ends_at ? new Date(ends_at) : undefined
        }
      });

      return reply.status(201).send(rule);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get all incentive rules for a retailer
  fastify.get('/', async (request, reply) => {
    const { retailerId } = request.query as { retailerId?: string };

    if (!retailerId) {
      return reply.status(400).send({ error: 'retailerId is required' });
    }

    try {
      const rules = await prisma.incentiveRule.findMany({
        where: { retailerId, active: true },
        orderBy: { created_at: 'desc' }
      });

      return reply.send(rules);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get a specific incentive rule by ID
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { retailerId } = request.query as { retailerId?: string };

    if (!retailerId) {
      return reply.status(400).send({ error: 'retailerId is required' });
    }

    try {
      const rule = await prisma.incentiveRule.findFirst({
        where: { id, retailerId, active: true }
      });

      if (!rule) {
        return reply.status(404).send({ error: 'Incentive rule not found' });
      }

      return reply.send(rule);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Update an incentive rule
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { retailerId } = request.query as { retailerId?: string };
    const {
      name,
      description,
      trigger_type,
      discount_type,
      discount_value,
      conditions,
      active,
      starts_at,
      ends_at
    } = request.body as {
      name?: string;
      description?: string;
      trigger_type?: 'FIRST_VISIT' | 'BIRTHDAY' | 'ANNIVERSARY' | 'LOYALTY_TIER';
      discount_type?: 'PERCENT' | 'FIXED_AMOUNT';
      discount_value?: number;
      conditions?: any;
      active?: boolean;
      starts_at?: string;
      ends_at?: string;
    };

    if (!retailerId) {
      return reply.status(400).send({ error: 'retailerId is required' });
    }

    // Validate input (only validate fields that are provided)
    const validationErrors: string[] = [];
    if (name !== undefined && (name === null || name.trim() === '')) {
      validationErrors.push('name cannot be empty');
    }
    if (trigger_type !== undefined && !['FIRST_VISIT', 'BIRTHDAY', 'ANNIVERSARY', 'LOYALTY_TIER'].includes(trigger_type)) {
      validationErrors.push('trigger_type must be one of: FIRST_VISIT, BIRTHDAY, ANNIVERSARY, LOYALTY_TIER');
    }
    if (discount_type !== undefined && !['PERCENT', 'FIXED_AMOUNT'].includes(discount_type)) {
      validationErrors.push('discount_type must be one of: PERCENT, FIXED_AMOUNT');
    }
    if (discount_value !== undefined && (typeof discount_value !== 'number' || discount_value < 0)) {
      validationErrors.push('discount_value must be a non-negative number');
    }
    if (discount_value !== undefined && discount_type === 'PERCENT' && discount_value > 100) {
      validationErrors.push('discount_value for PERCENT type should not exceed 100');
    }
    if (starts_at !== undefined && ends_at !== undefined) {
      const startDate = new Date(starts_at);
      const endDate = new Date(ends_at);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        validationErrors.push('starts_at and ends_at must be valid date strings');
      } else if (startDate > endDate) {
        validationErrors.push('starts_at must be before ends_at');
      }
    }

    if (validationErrors.length > 0) {
      return reply.status(400).send({ error: 'Validation failed', details: validationErrors });
    }

    try {
      // Check if rule exists and belongs to retailer
      const existingRule = await prisma.incentiveRule.findFirst({
        where: { id, retailerId }
      });

      if (!existingRule) {
        return reply.status(404).send({ error: 'Incentive rule not found' });
      }

      // Update rule
      const rule = await prisma.incentiveRule.update({
        where: { id },
        data: {
          name,
          description,
          trigger_type,
          discount_type,
          discount_value,
          conditions: conditions ?? undefined,
          active,
          starts_at: starts_at ? new Date(starts_at) : undefined,
          ends_at: ends_at ? new Date(ends_at) : undefined
        }
      });

      return reply.send(rule);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Delete (deactivate) an incentive rule
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { retailerId } = request.query as { retailerId?: string };

    if (!retailerId) {
      return reply.status(400).send({ error: 'retailerId is required' });
    }

    try {
      // Check if rule exists and belongs to retailer
      const existingRule = await prisma.incentiveRule.findFirst({
        where: { id, retailerId }
      });

      if (!existingRule) {
        return reply.status(404).send({ error: 'Incentive rule not found' });
      }

      // Soft delete by setting active to false
      const rule = await prisma.incentiveRule.update({
        where: { id },
        data: { active: false }
      });

      return reply.send({ message: 'Incentive rule deactivated successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Check applicable incentives for a customer/retailer (and optionally apply)
  fastify.post('/check', async (request, reply) => {
    const { retailerId, customerId } = request.body as {
      retailerId: string;
      customerId: string;
    };

    if (!retailerId || !customerId) {
      return reply.status(400).send({ error: 'retailerId and customerId are required' });
    }

    try {
      // Get active incentive rules for the retailer
      const rules = await prisma.incentiveRule.findMany({
        where: {
          retailerId,
          active: true,
          // Check if rule is within its validity period (if starts_at/ends_at are set)
          AND: [
            {
              OR: [
                { starts_at: null },
                { starts_at: { lte: new Date() } }
              ]
            },
            {
              OR: [
                { ends_at: null },
                { ends_at: { gte: new Date() } }
              ]
            }
          ]
        }
      });

      // Get customer's visit history and other data needed for rule evaluation
      const customer = await prisma.customer.findUnique({
        where: { id: customerId }
      });

      if (!customer) {
        return reply.status(404).send({ error: 'Customer not found' });
      }

      // Get visit count for this customer at this retailer
      const visitCount = await prisma.customerVisit.count({
        where: { retailerId, customerId }
      });

      // Get total spent by this customer at this retailer (from customer.total_spent)
      const totalSpent = customer.total_spent || 0;

      // Evaluate each rule to see if it applies
      const applicableIncentives = [];

      for (const rule of rules) {
        let applies = false;

        switch (rule.trigger_type) {
          case 'FIRST_VISIT':
            applies = visitCount === 0; // First visit ever
            break;
          case 'BIRTHDAY':
            // We would need the customer's birthdate, which we don't have in the schema.
            // For now, skip or assume we have a way to check.
            // We'll leave it as not implemented for now.
            applies = false;
            break;
          case 'ANNIVERSARY':
            // We would need the customer's first visit date or anniversary date.
            applies = false;
            break;
          case 'LOYALTY_TIER':
            if (rule.conditions) {
              const minSpent = rule.conditions.min_spent ?? 0;
              const minVisits = rule.conditions.min_visits ?? 0;
              applies = totalSpent >= minSpent && visitCount >= minVisits;
            }
            break;
        }

        if (applies) {
          applicableIncentives.push({
            ruleId: rule.id,
            name: rule.name,
            description: rule.description,
            trigger_type: rule.trigger_type,
            discount_type: rule.discount_type,
            discount_value: rule.discount_value
          });
        }
      }

      return reply.send({ applicableIncentives });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}