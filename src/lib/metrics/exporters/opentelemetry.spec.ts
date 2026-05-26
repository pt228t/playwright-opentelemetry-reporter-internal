import {
  BatchObservableCallback,
  Context,
  Counter,
  Gauge,
  Histogram,
  Meter,
  MetricAttributes,
  Observable,
  ObservableCounter,
  ObservableGauge,
  ObservableUpDownCounter,
  UpDownCounter,
} from '@opentelemetry/api';
import test from 'ava';

import { OpenTelemetryMetricsExporter } from './opentelemetry';

class FakeHistogram implements Histogram {
  records: Array<{ attributes: unknown; value: number }> = [];

  record(value: number, attributes?: unknown): void {
    this.records.push({ attributes, value });
  }
}

class FakeCounter implements Counter {
  additions: Array<{ attributes: unknown; value: number }> = [];

  add(value: number, attributes?: unknown): void {
    this.additions.push({ attributes, value });
  }
}

class FakeGauge implements Gauge {
  records: Array<{ attributes: unknown; value: number }> = [];

  record(value: number, attributes?: unknown): void {
    this.records.push({ attributes, value });
  }
}

class FakeUpDownCounter implements UpDownCounter {
  additions: Array<{ attributes?: MetricAttributes; value: number }> = [];

  add(value: number, attributes?: MetricAttributes): void {
    this.additions.push({ attributes, value });
  }
}

class FakeObservable implements Observable {
  callbackCount = 0;

  addCallback(): void {
    this.callbackCount += 1;
  }

  removeCallback(): void {
    this.callbackCount -= 1;
  }
}

class FakeMeter implements Meter {
  counters = new Map<string, FakeCounter>();
  gauges = new Map<string, FakeGauge>();
  histograms = new Map<string, FakeHistogram>();

  createCounter(name: string): Counter {
    const counter = new FakeCounter();

    this.counters.set(name, counter);

    return counter;
  }

  createGauge(name: string): Gauge {
    const gauge = new FakeGauge();

    this.gauges.set(name, gauge);

    return gauge;
  }

  createHistogram(name: string): Histogram {
    const histogram = new FakeHistogram();

    this.histograms.set(name, histogram);

    return histogram;
  }

  createObservableCounter(): ObservableCounter {
    return new FakeObservable();
  }

  createObservableGauge(): ObservableGauge {
    return new FakeObservable();
  }

  createObservableUpDownCounter(): ObservableUpDownCounter {
    return new FakeObservable();
  }

  createUpDownCounter(): UpDownCounter {
    return new FakeUpDownCounter();
  }

  batchCallbackCount = 0;

  addBatchObservableCallback(
    callback: BatchObservableCallback,
    observables: Observable[]
  ): void {
    void callback;
    void observables;
    this.batchCallbackCount += 1;
  }

  removeBatchObservableCallback(
    callback: BatchObservableCallback,
    observables: Observable[],
    context?: Context
  ): void {
    void callback;
    void observables;
    void context;
    this.batchCallbackCount -= 1;
  }
}

test('OpenTelemetryMetricsExporter records duration metrics as histograms', (t) => {
  const meter = new FakeMeter();
  const exporter = new OpenTelemetryMetricsExporter(meter);

  exporter.send({
    attributes: { status: 'passed' },
    kind: 'duration',
    name: 'test.duration',
    timestamp: 1000,
    value: 42,
  });

  t.deepEqual(meter.histograms.get('test.duration')?.records, [
    {
      attributes: { status: 'passed' },
      value: 42,
    },
  ]);
});

test('OpenTelemetryMetricsExporter records counter metrics as counters', (t) => {
  const meter = new FakeMeter();
  const exporter = new OpenTelemetryMetricsExporter(meter);

  exporter.send({
    attributes: { status: 'failed' },
    kind: 'counter',
    name: 'test.count',
    timestamp: 1000,
    value: 1,
  });

  t.deepEqual(meter.counters.get('test.count')?.additions, [
    {
      attributes: { status: 'failed' },
      value: 1,
    },
  ]);
});

test('OpenTelemetryMetricsExporter records gauge metrics as gauges', (t) => {
  const meter = new FakeMeter();
  const exporter = new OpenTelemetryMetricsExporter(meter);

  exporter.send({
    attributes: { project: 'chromium' },
    kind: 'gauge',
    name: 'test.active.count',
    timestamp: 1000,
    value: 3,
  });

  t.deepEqual(meter.gauges.get('test.active.count')?.records, [
    {
      attributes: { project: 'chromium' },
      value: 3,
    },
  ]);
});

test('OpenTelemetryMetricsExporter reuses instruments by metric name', (t) => {
  const meter = new FakeMeter();
  const exporter = new OpenTelemetryMetricsExporter(meter);

  exporter.send({
    attributes: {},
    kind: 'duration',
    name: 'test.duration',
    timestamp: 1000,
    value: 10,
  });
  exporter.send({
    attributes: {},
    kind: 'duration',
    name: 'test.duration',
    timestamp: 1001,
    value: 20,
  });

  t.is(meter.histograms.size, 1);
  t.deepEqual(meter.histograms.get('test.duration')?.records, [
    { attributes: {}, value: 10 },
    { attributes: {}, value: 20 },
  ]);
});
