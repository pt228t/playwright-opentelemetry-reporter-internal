import test from 'ava';

import { MetricsCollector } from './collector';
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

test('MetricsCollector records test duration with attributes', (t) => {
  const exporter = new MockMetricsExporter();
  const collector = new MetricsCollector(exporter);

  collector.recordTestStart({
    id: 'test-1',
    suiteName: 'example suite',
    title: 'example test',
  });
  collector.recordTestEnd(
    {
      id: 'test-1',
      suiteName: 'example suite',
      title: 'example test',
    },
    { status: 'passed', duration: 150 }
  );

  t.like(exporter.metrics[0], {
    name: 'test.duration',
    kind: 'duration',
    value: 150,
    attributes: {
      'test.case.name': 'example test',
      'test.result.status': 'passed',
      'test.retry.count': 0,
      'test.suite.name': 'example suite',
    },
  });
});

test('MetricsCollector tracks multiple tests independently', (t) => {
  const exporter = new MockMetricsExporter();
  const collector = new MetricsCollector(exporter);

  collector.recordTestStart({ id: 'test-1', title: 'first test' });
  collector.recordTestStart({ id: 'test-2', title: 'second test' });
  collector.recordTestEnd(
    { id: 'test-1', title: 'first test' },
    { status: 'passed', duration: 100 }
  );
  collector.recordTestEnd(
    { id: 'test-2', title: 'second test' },
    { status: 'failed', duration: 200 }
  );

  const durationMetrics = exporter.metrics.filter(
    (metric) => metric.name === 'test.duration'
  );
  const runMetrics = collector.getMetrics();

  t.is(durationMetrics.length, 2);
  t.is(durationMetrics[0].value, 100);
  t.is(durationMetrics[1].value, 200);
  t.is(runMetrics.testCount, 2);
  t.is(runMetrics.passedCount, 1);
  t.is(runMetrics.failedCount, 1);
});

test('MetricsCollector calculates duration percentiles', (t) => {
  const exporter = new MockMetricsExporter();
  const collector = new MetricsCollector(exporter);

  for (let index = 0; index < 10; index += 1) {
    const duration = (index + 1) * 10;
    const testCase = { id: `test-${index}`, title: `test ${index}` };

    collector.recordTestStart(testCase);
    collector.recordTestEnd(testCase, { status: 'passed', duration });
  }

  t.deepEqual(collector.getMetrics().testDurationPercentiles, {
    min: 10,
    p25: 30,
    p50: 50,
    p75: 80,
    p95: 100,
    p99: 100,
    max: 100,
  });
});

test('MetricsCollector records step duration before test end', (t) => {
  const exporter = new MockMetricsExporter();
  const collector = new MetricsCollector(exporter);
  const testCase = {
    id: 'test-1',
    suiteName: 'example suite',
    title: 'example test',
  };

  collector.recordTestStart(testCase);
  collector.recordStepStart(testCase, {
    id: 'step-1',
    title: 'click button',
    category: 'pw:api',
  });
  collector.recordStepEnd(testCase, {
    id: 'step-1',
    title: 'click button',
    category: 'pw:api',
    duration: 25,
  });
  collector.recordTestEnd(testCase, { status: 'passed', duration: 100 });

  t.like(exporter.metrics[0], {
    name: 'test.step.duration',
    kind: 'duration',
    value: 25,
    attributes: {
      'test.case.name': 'example test',
      'test.step.category': 'pw:api',
      'test.step.name': 'click button',
      'test.suite.name': 'example suite',
    },
  });
  t.deepEqual(collector.getTestMetric('test-1')?.stepMetrics, [
    {
      stepId: 'step-1',
      stepName: 'click button',
      category: 'pw:api',
      duration: 25,
      status: 'passed',
    },
  ]);
});

test('MetricsCollector records suite name on test count metrics', (t) => {
  const exporter = new MockMetricsExporter();
  const collector = new MetricsCollector(exporter);
  const testCase = {
    id: 'test-1',
    suiteName: 'checkout suite',
    title: 'checkout completes',
  };

  collector.recordTestStart(testCase);
  collector.recordTestEnd(testCase, { status: 'passed', duration: 100 });

  t.like(
    exporter.metrics.find((metric) => metric.name === 'test.count'),
    {
      attributes: {
        'test.case.name': 'checkout completes',
        'test.result.status': 'passed',
        'test.retry.count': 0,
        'test.suite.name': 'checkout suite',
      },
    }
  );
});

test('MetricsCollector omits suite name attribute when suite name is missing', (t) => {
  const exporter = new MockMetricsExporter();
  const collector = new MetricsCollector(exporter);
  const testCase = {
    id: 'test-1',
    title: 'standalone metric source',
  };

  collector.recordTestStart(testCase);
  collector.recordStepStart(testCase, {
    id: 'step-1',
    title: 'standalone step',
  });
  collector.recordStepEnd(testCase, {
    id: 'step-1',
    title: 'standalone step',
    duration: 10,
  });
  collector.recordTestEnd(testCase, { status: 'passed', duration: 100 });

  for (const metric of exporter.metrics) {
    t.false(
      Object.prototype.hasOwnProperty.call(metric.attributes, 'test.suite.name')
    );
  }
});

test('MetricsCollector delegates shutdown to exporter', async (t) => {
  const exporter = new MockMetricsExporter();
  const collector = new MetricsCollector(exporter);

  await collector.shutdown();

  t.is(exporter.shutdownCallCount, 1);
});

test('MetricsCollector adds global and test attributes to metrics', (t) => {
  const exporter = new MockMetricsExporter();
  const collector = new MetricsCollector(exporter, undefined, undefined, {
    'git.branch': 'main',
    'git.commit.sha': 'abc123',
  });
  const testCase = {
    attributes: {
      owner: 'checkout',
    },
    id: 'test-1',
    title: 'example test',
  };

  collector.recordTestStart(testCase);
  collector.recordTestEnd(testCase, { status: 'passed', duration: 150 });

  t.like(exporter.metrics[0], {
    attributes: {
      'git.branch': 'main',
      'git.commit.sha': 'abc123',
      owner: 'checkout',
      'test.case.name': 'example test',
      'test.result.status': 'passed',
      'test.retry.count': 0,
    },
  });
  t.like(exporter.metrics[1], {
    attributes: {
      'git.branch': 'main',
      'git.commit.sha': 'abc123',
      owner: 'checkout',
      'test.case.name': 'example test',
      'test.result.status': 'passed',
      'test.retry.count': 0,
    },
  });
});
