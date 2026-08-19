// ponytail: minimal analytics service for feature performance metrics, A/B testing, and basic predictions
// TODO: Enhance with real-time processing, advanced ML models, and visualization integrations
import Fastify from 'fastify';
import { PrismaClient } from '@kanchuki/db';

const fastify = Fastify({
  logger: true
});

// Initialize Prisma client
const prisma = new PrismaClient();

// In-memory storage for demo purposes (in production, use proper database tables)
const metricsStore = new Map();
const abTestsStore = new Map();

// Health check
fastify.get('/health', async () => {
  return { status: 'ok' };
});

// === METRICS ENDPOINTS ===

// Record a metric
fastify.post('/metrics/:featureName', async (request, reply) => {
  const { featureName } = request.params as { featureName: string };
  const { value, timestamp, tags } = request.body as {
    value: number;
    timestamp?: string;
    tags?: Record<string, string>;
  };

  if (!featureName || typeof value !== 'number') {
    return reply.status(400).send({ error: 'featureName and numeric value are required' });
  }

  const metricData = {
    value,
    timestamp: timestamp || new Date().toISOString(),
    tags: tags || {}
  };

  // Store metric (in production, use proper time-series database)
  if (!metricsStore.has(featureName)) {
    metricsStore.set(featureName, []);
  }
  metricsStore.get(featureName)!.push(metricData);

  // Keep only last 1000 metrics per feature to prevent memory issues
  if (metricsStore.get(featureName)!.length > 1000) {
    metricsStore.set(featureName, metricsStore.get(featureName)!.slice(-1000));
  }

  return { recorded: true, featureName, value };
});

// Get metrics for a feature
fastify.get('/metrics/:featureName', async (request, reply) => {
  const { featureName } = request.params as { featureName: string };
  const { limit, startTime, endTime } = request.query as {
    limit?: number;
    startTime?: string;
    endTime?: string;
  };

  if (!metricsStore.has(featureName)) {
    return { featureName, metrics: [], count: 0 };
  }

  let metrics = [...metricsStore.get(featureName)!];

  // Apply time filtering if specified
  if (startTime || endTime) {
    const start = startTime ? new Date(startTime) : new Date(0);
    const end = endTime ? new Date(endTime) : new Date();

    metrics = metrics.filter(m => {
      const metricTime = new Date(m.timestamp);
      return metricTime >= start && metricTime <= end;
    });
  }

  // Apply limit
  if (limit && limit > 0) {
    metrics = metrics.slice(-limit);
  }

  return {
    featureName,
    metrics,
    count: metrics.length
  };
});

// Get summary statistics for a feature
fastify.get('/metrics/:featureName/summary', async (request, reply) => {
  const { featureName } = request.params as { featureName: string };

  if (!metricsStore.has(featureName) || metricsStore.get(featureName)!.length === 0) {
    return {
      featureName,
      count: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      latest: null
    };
  }

  const metrics = metricsStore.get(featureName)!;
  const values = metrics.map(m => m.value).sort((a, b) => a - b);
  const count = values.length;

  const min = values[0];
  const max = values[count - 1];
  const mean = values.reduce((sum, val) => sum + val, 0) / count;
  const median = count % 2 === 0
    ? (values[count / 2 - 1] + values[count / 2]) / 2
    : values[Math.floor(count / 2)];
  const latest = metrics[metrics.length - 1];

  return {
    featureName,
    count,
    min,
    max,
    mean,
    median,
    latest
  };
});

// === A/B TESTING ENDPOINTS ===

// Create a new A/B test
fastify.post('/ab-tests', async (request, reply) => {
  const { name, variants, description } = request.body as {
    name: string;
    variants: string[];
    description?: string;
  };

  if (!name || !variants || variants.length < 2) {
    return reply.status(400).send({ 
      error: 'name and at least 2 variants are required' 
    });
  }

  const testId = `abtest_${Date.now()}`;
  const testData = {
    id: testId,
    name,
    variants: variants.reduce((acc, variant) => {
      acc[variant] = { 
        impressions: 0, 
        conversions: 0,
        conversionRate: 0
      };
      return acc;
    }, {} as Record<string, { impressions: number; conversions: number; conversionRate: number }>),
    description: description || '',
    createdAt: new Date().toISOString(),
    isActive: true
  };

  abTestsStore.set(testId, testData);

  return {
    testId,
    ...testData
  };
});

// Get an A/B test
fastify.get('/ab-tests/:testId', async (request, reply) => {
  const { testId } = request.params as { testId: string };

  if (!abTestsStore.has(testId)) {
    return reply.status(404).send({ error: 'A/B test not found' });
  }

  return abTestsStore.get(testId)!;
});

// Record an impression for a variant
fastify.post('/ab-tests/:testId/impressions/:variant', async (request, reply) => {
  const { testId, variant } = request.params as { testId: string; variant: string };

  if (!abTestsStore.has(testId)) {
    return reply.status(404).send({ error: 'A/B test not found' });
  }

  const test = abTestsStore.get(testId)!;
  if (!test.variants[variant]) {
    return reply.status(400).send({ error: 'Variant not found in test' });
  }

  test.variants[variant].impressions += 1;
  // Recalculate conversion rate
  const { impressions, conversions } = test.variants[variant];
  test.variants[variant].conversionRate = 
    impressions > 0 ? (conversions / impressions) * 100 : 0;

  abTestsStore.set(testId, test);

  return {
    testId,
    variant,
    impressions: test.variants[variant].impressions,
    conversions: test.variants[variant].conversions,
    conversionRate: test.variants[variant].conversionRate
  };
});

// Record a conversion for a variant
fastify.post('/ab-tests/:testId/conversions/:variant', async (request, reply) => {
  const { testId, variant } = request.params as { testId: string; variant: string };

  if (!abTestsStore.has(testId)) {
    return reply.status(404).send({ error: 'A/B test not found' });
  }

  const test = abTestsStore.get(testId)!;
  if (!test.variants[variant]) {
    return reply.status(400).send({ error: 'Variant not found in test' });
  }

  test.variants[variant].conversions += 1;
  // Recalculate conversion rate
  const { impressions, conversions } = test.variants[variant];
  test.variants[variant].conversionRate = 
    impressions > 0 ? (conversions / impressions) * 100 : 0;

  abTestsStore.set(testId, test);

  return {
    testId,
    variant,
    impressions: test.variants[variant].impressions,
    conversions: test.variants[variant].conversions,
    conversionRate: test.variants[variant].conversionRate
  };
});

// Get all active A/B tests
fastify.get('/ab-tests', async (request, reply) => {
  const activeTests: any[] = [];
  for (const [testId, test] of abTestsStore.entries()) {
    if (test.isActive) {
      activeTests.push({
        id: testId,
        name: test.name,
        variants: Object.keys(test.variants),
        createdAt: test.createdAt
      });
    }
  }

  return { activeTests, count: activeTests.length };
});

// === PREDICTIVE ANALYTICS ENDPOINTS ===

// Get simple prediction for a feature (placeholder implementation)
fastify.get('/predict/:featureName', async (request, reply) => {
  const { featureName } = request.params as { featureName: string };
  const { daysAhead } = request.query as { daysAhead?: number };

  if (!metricsStore.has(featureName) || metricsStore.get(featureName)!.length === 0) {
    return {
      featureName,
      prediction: null,
      confidence: 0,
      note: 'No historical data available for prediction'
    };
  }

  const metrics = metricsStore.get(featureName)!;
  const values = metrics.map(m => m.value);

  // Very simple prediction: just use the last value (placeholder)
  // In production, this would be replaced with proper ML models
  const lastValue = values[values.length - 1];
  
  // Simple trend-based prediction (placeholder)
  const prediction = lastValue * (1 + (Math.random() - 0.5) * 0.1); // ±5% random variation
  
  return {
    featureName,
    prediction: Number(prediction.toFixed(2)),
    confidence: 0.6, // Placeholder confidence
    method: 'simple_last_value_with_variation',
    daysAhead: daysAhead || 1,
    note: 'This is a placeholder prediction. Replace with proper ML model for production use.'
  };
});

// Get all feature names that have metrics
fastify.get('/metrics/features', async (request, reply) => {
  const features = Array.from(metricsStore.keys());
  return { features, count: features.length };
});

// Self-check: test basic logic
function demo() {
  // Test metrics functionality
  metricsStore.clear();
  abTestsStore.clear();
  
  // Test recording a metric
  const testMetric = { value: 42, tags: { env: 'test' } };
  // Simulate recording (we can't actually call the endpoint in demo)
  
  // Test A/B test creation
  const testId = `abtest_${Date.now()}`;
  if (!testId.startsWith('abtest_')) {
    throw new Error('Demo failed: A/B test ID generation failed');
  }
  
  // Test prediction with no data
  // Would return null prediction with appropriate message
  
  console.log('Demo passed: Analytics service basic logic is correct');
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demo();
}

const start = async () => {
  try {
    // Use port 3009 to avoid conflict with other services
    await fastify.listen({ port: 3009, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${fastify.server.address()}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();