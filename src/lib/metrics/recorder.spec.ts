import test from 'ava';

import { MetricRecorder } from './recorder';
import { Metric, MetricsExporter } from './types';

class MockMetricsExporter implements MetricsExporter {
  metrics: Metric[] = [];

  send(metric: Metric): void {
    this.metrics.push(metric);
  }
}

test('MetricRecorder records duration metrics', (t) => {
  const exporter = new MockMetricsExporter();
  const recorder = new MetricRecorder(exporter, () => 1000);

  recorder.recordDuration('test.duration', 42, { suite: 'checkout' });

  t.deepEqual(exporter.metrics, [
    {
      name: 'test.duration',
      kind: 'duration',
      value: 42,
      attributes: { suite: 'checkout' },
      timestamp: 1000,
    },
  ]);
});

test('MetricRecorder records counters with default increment', (t) => {
  const exporter = new MockMetricsExporter();
  const recorder = new MetricRecorder(exporter, () => 1000);

  recorder.recordCounter('test.count', undefined, { status: 'passed' });

  t.like(exporter.metrics[0], {
    name: 'test.count',
    kind: 'counter',
    value: 1,
    attributes: { status: 'passed' },
  });
});

test('MetricRecorder records gauge metrics', (t) => {
  const exporter = new MockMetricsExporter();
  const recorder = new MetricRecorder(exporter, () => 1000);

  recorder.recordGauge('test.flaky.score', 0.25);

  t.like(exporter.metrics[0], {
    name: 'test.flaky.score',
    kind: 'gauge',
    value: 0.25,
  });
});
