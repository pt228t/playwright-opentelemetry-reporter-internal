import {
  FullConfig,
  TestCase as PlaywrightTestCase,
  TestResult as PlaywrightTestResult,
  TestStep as PlaywrightTestStep,
} from '@playwright/test/reporter';
import test from 'ava';

import { annotationLabel } from '../reporter';

import { MetricsCollector } from './collector';
import { PlaywrightMetricsListener } from './playwright-listener';
import { Metric, MetricsExporter } from './types';

class MockMetricsExporter implements MetricsExporter {
  metrics: Metric[] = [];
  shutdownCallCount = 0;

  send(metric: Metric): void {
    this.metrics.push(metric);
  }

  shutdown(): void {
    this.shutdownCallCount += 1;
  }
}

const config = {
  rootDir: '/repo',
} as FullConfig;

function createTestCase(
  outcome: PlaywrightTestCase['outcome'] = () => 'expected'
): PlaywrightTestCase {
  return {
    annotations: [],
    expectedStatus: 'passed',
    id: 'test-1',
    location: {
      column: 1,
      file: '/repo/tests/example.spec.ts',
      line: 10,
    },
    outcome,
    parent: {
      title: 'example suite',
    },
    tags: [],
    title: 'works',
    titlePath: () => ['', 'chromium', 'tests/example.spec.ts', 'works'],
  } as PlaywrightTestCase;
}

function createAnnotatedTestCase(): PlaywrightTestCase {
  return {
    ...createTestCase(),
    annotations: [
      {
        type: annotationLabel('git.branch'),
        description: 'main',
      },
      {
        type: annotationLabel('owner'),
        description: 'checkout',
      },
      {
        type: 'not_for_otel_metrics',
        description: 'ignored',
      },
    ],
  } as PlaywrightTestCase;
}

function createResult(
  status: PlaywrightTestResult['status']
): PlaywrightTestResult {
  return {
    duration: 100,
    errors: [],
    retry: 1,
    startTime: new Date('2026-05-21T00:00:00.000Z'),
    status,
  } as PlaywrightTestResult;
}

test('PlaywrightMetricsListener records flaky status from Playwright outcome', (t) => {
  const exporter = new MockMetricsExporter();
  const collector = new MetricsCollector(exporter);
  const listener = new PlaywrightMetricsListener(collector);
  const testCase = createTestCase(() => 'flaky');

  listener.onBegin(config);
  listener.onTestBegin(testCase);
  listener.onTestEnd(testCase, createResult('passed'));

  const metrics = collector.getTestMetric('test-1');

  t.is(metrics?.status, 'flaky');
  t.is(metrics?.retryCount, 1);
  t.is(metrics?.projectName, 'chromium');
  t.is(metrics?.suiteName, 'example suite');
  t.true(metrics?.testName.includes('[chromium]'));
  t.like(
    exporter.metrics.find((metric) => metric.name === 'test.duration'),
    {
      attributes: {
        'test.result.status': 'flaky',
        'test.suite.name': 'example suite',
      },
    }
  );
});

test('PlaywrightMetricsListener records failed step status', (t) => {
  const exporter = new MockMetricsExporter();
  const collector = new MetricsCollector(exporter);
  const listener = new PlaywrightMetricsListener(collector);
  const testCase = createTestCase();
  const step = {
    category: 'expect',
    duration: 30,
    error: { message: 'Expected true' },
    startTime: new Date('2026-05-21T00:00:00.030Z'),
    steps: [],
    title: 'expect value',
    titlePath: () => ['expect value'],
  } as PlaywrightTestStep;

  listener.onBegin(config);
  listener.onTestBegin(testCase);
  listener.onStepBegin(testCase, createResult('passed'), step);
  listener.onStepEnd(testCase, createResult('passed'), step);
  listener.onTestEnd(testCase, createResult('passed'));

  t.deepEqual(collector.getTestMetric('test-1')?.stepMetrics, [
    {
      category: 'expect',
      duration: 30,
      status: 'failed',
      stepId:
        '8205632fe62478e1432cb5997f863d1ad745ceb8c49882fdc6f029a6e245c2a6',
      stepName: 'expect value',
    },
  ]);
});

test('PlaywrightMetricsListener shuts down collector on run end', async (t) => {
  const exporter = new MockMetricsExporter();
  const collector = new MetricsCollector(exporter);
  const listener = new PlaywrightMetricsListener(collector);

  await listener.onEnd();

  t.is(exporter.shutdownCallCount, 1);
});

test('PlaywrightMetricsListener adds prefixed annotation attributes to metrics', (t) => {
  const exporter = new MockMetricsExporter();
  const collector = new MetricsCollector(exporter);
  const listener = new PlaywrightMetricsListener(collector);
  const testCase = createAnnotatedTestCase();

  listener.onBegin(config);
  listener.onTestBegin(testCase);
  listener.onTestEnd(testCase, createResult('passed'));

  t.like(
    exporter.metrics.find((metric) => metric.name === 'test.duration'),
    {
      attributes: {
        'git.branch': 'main',
        owner: 'checkout',
        'test.result.status': 'passed',
        'test.suite.name': 'example suite',
      },
    }
  );
  t.false(
    Object.prototype.hasOwnProperty.call(
      exporter.metrics[0].attributes,
      'not_for_otel_metrics'
    )
  );
});
