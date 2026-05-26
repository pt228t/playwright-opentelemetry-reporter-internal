import opentelemetry from '@opentelemetry/api';
import {
  FullConfig,
  FullResult,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
import test from 'ava';

import { TestEventListener } from './event-listener';
import { Metric, MetricsExporter } from './metrics';
import { OpenTelemetryReporter } from './reporter';

class MockMetricsExporter implements MetricsExporter {
  metrics: Metric[] = [];

  send(metric: Metric): void {
    this.metrics.push(metric);
  }
}

class FakeSpan {
  attributes: Record<string, unknown> = {};
  ended = false;
  status: unknown;

  setAttributes(attributes: Record<string, unknown>): void {
    this.attributes = {
      ...this.attributes,
      ...attributes,
    };
  }

  setAttribute(key: string, value: unknown): void {
    this.attributes = {
      ...this.attributes,
      [key]: value,
    };
  }

  setStatus(status: unknown): void {
    this.status = status;
  }

  end(): void {
    this.ended = true;
  }
}

class FakeTracer {
  spans: Array<{ name: string; span: FakeSpan }> = [];

  startSpan(name: string): FakeSpan {
    const span = new FakeSpan();

    this.spans.push({ name, span });

    return span;
  }
}

function installTracerMock(tracer: FakeTracer): () => void {
  const traceApi = opentelemetry.trace as unknown as {
    getTracer: () => unknown;
    setSpan: (context: unknown, span: unknown) => unknown;
  };
  const contextApi = opentelemetry.context as unknown as {
    active: () => unknown;
  };
  const originalGetTracer = traceApi.getTracer;
  const originalSetSpan = traceApi.setSpan;
  const originalActive = contextApi.active;

  traceApi.getTracer = () => tracer;
  traceApi.setSpan = (context: unknown, span: unknown) => ({ context, span });
  contextApi.active = () => ({});

  return () => {
    traceApi.getTracer = originalGetTracer;
    traceApi.setSpan = originalSetSpan;
    contextApi.active = originalActive;
  };
}

const config = {
  rootDir: '/repo',
} as FullConfig;

const testCase = {
  annotations: [],
  expectedStatus: 'passed',
  id: 'test-1',
  location: {
    column: 1,
    file: '/repo/tests/example.spec.ts',
    line: 10,
  },
  outcome: () => 'expected',
  parent: {
    title: 'example suite',
  },
  tags: [],
  title: 'works',
  titlePath: () => ['', 'chromium', 'tests/example.spec.ts', 'works'],
} as TestCase;

const result = {
  duration: 100,
  errors: [],
  retry: 0,
  startTime: new Date('2026-05-21T00:00:00.000Z'),
  status: 'passed',
} as TestResult;

const step = {
  category: 'pw:api',
  duration: 25,
  startTime: new Date('2026-05-21T00:00:00.025Z'),
  steps: [],
  title: 'click button',
  titlePath: () => ['click button'],
} as TestStep;

test('OpenTelemetryReporter notifies subscribed listeners', async (t) => {
  const calls: string[] = [];
  const listener: TestEventListener = {
    onBegin: () => calls.push('begin'),
    onEnd: () => {
      calls.push('end');
    },
    onStepBegin: () => calls.push('step-begin'),
    onStepEnd: () => calls.push('step-end'),
    onTestBegin: () => calls.push('test-begin'),
    onTestEnd: () => calls.push('test-end'),
  };
  const reporter = new OpenTelemetryReporter();

  reporter.subscribe(listener);
  reporter.onBegin(config);
  reporter.onTestBegin(testCase, result);
  reporter.onStepBegin(testCase, result, step);
  reporter.onStepEnd(testCase, result, step);
  reporter.onTestEnd(testCase, result);
  await reporter.onEnd({ status: 'passed' } as FullResult);

  t.deepEqual(calls, [
    'begin',
    'test-begin',
    'step-begin',
    'step-end',
    'test-end',
    'end',
  ]);
});

test('OpenTelemetryReporter accepts constructor listeners and unsubscribes', (t) => {
  const calls: string[] = [];
  const listener: TestEventListener = {
    onTestBegin: () => calls.push('test-begin'),
  };
  const reporter = new OpenTelemetryReporter({ listeners: [listener] });

  reporter.onBegin(config);
  reporter.onTestBegin(testCase, result);
  reporter.unsubscribe(listener);
  reporter.onTestBegin(testCase, result);

  t.deepEqual(calls, ['test-begin']);
});

test('OpenTelemetryReporter wires metrics listener by default', (t) => {
  const exporter = new MockMetricsExporter();
  const reporter = new OpenTelemetryReporter({
    metrics: { exporter },
  });

  reporter.onBegin(config);
  reporter.onTestBegin(testCase, result);
  reporter.onTestEnd(testCase, result);

  t.like(
    exporter.metrics.find((metric) => metric.name === 'test.duration'),
    {
      attributes: {
        'test.result.status': 'passed',
      },
      kind: 'duration',
      value: 100,
    }
  );
});

test('OpenTelemetryReporter supports disabling metrics listener', (t) => {
  const exporter = new MockMetricsExporter();
  const reporter = new OpenTelemetryReporter({
    listeners: [
      {
        onTestEnd: () => {
          exporter.send({
            attributes: {},
            kind: 'counter',
            name: 'custom.listener.count',
            timestamp: 1000,
            value: 1,
          });
        },
      },
    ],
    metrics: false,
  });

  reporter.onBegin(config);
  reporter.onTestBegin(testCase, result);
  reporter.onTestEnd(testCase, result);

  t.deepEqual(
    exporter.metrics.map((metric) => metric.name),
    ['custom.listener.count']
  );
});

test('OpenTelemetryReporter adds configured metrics attributes', (t) => {
  const exporter = new MockMetricsExporter();
  const reporter = new OpenTelemetryReporter({
    metrics: {
      attributes: {
        'git.branch': 'main',
        'git.commit.sha': 'abc123',
      },
      exporter,
    },
  });

  reporter.onBegin(config);
  reporter.onTestBegin(testCase, result);
  reporter.onTestEnd(testCase, result);

  t.like(
    exporter.metrics.find((metric) => metric.name === 'test.duration'),
    {
      attributes: {
        'git.branch': 'main',
        'git.commit.sha': 'abc123',
        'test.result.status': 'passed',
      },
    }
  );
});

test('OpenTelemetryReporter adds configured trace attributes', (t) => {
  const tracer = new FakeTracer();
  const restore = installTracerMock(tracer);
  const reporter = new OpenTelemetryReporter({
    traces: {
      attributes: {
        'git.branch': 'main',
        'pipeline.id': '123',
      },
    },
  });

  t.teardown(restore);

  reporter.onBegin(config);
  reporter.onTestBegin(testCase, result);
  reporter.onStepBegin(testCase, result, step);
  reporter.onStepEnd(testCase, result, step);
  reporter.onTestEnd(testCase, result);

  t.is(tracer.spans.length, 2);
  t.is(
    String(tracer.spans[0].span.attributes['test.case.name']).includes(
      '[chromium]'
    ),
    true
  );
  t.like(tracer.spans[0].span.attributes, {
    'git.branch': 'main',
    'pipeline.id': '123',
    'test.suite.name': 'example suite',
  });
  t.like(tracer.spans[1].span.attributes, {
    'git.branch': 'main',
    'pipeline.id': '123',
    'test.step.category': 'pw:api',
    'test.step.name': 'click button',
  });
});

test('OpenTelemetryReporter supports disabling traces with boolean false', (t) => {
  const tracer = new FakeTracer();
  const restore = installTracerMock(tracer);
  const exporter = new MockMetricsExporter();
  const reporter = new OpenTelemetryReporter({
    metrics: { exporter },
    traces: false,
  });

  t.teardown(restore);

  reporter.onBegin(config);
  reporter.onTestBegin(testCase, result);
  reporter.onStepBegin(testCase, result, step);
  reporter.onStepEnd(testCase, result, step);
  reporter.onTestEnd(testCase, result);

  t.is(tracer.spans.length, 0);
  t.like(
    exporter.metrics.find((metric) => metric.name === 'test.duration'),
    {
      attributes: {
        'test.result.status': 'passed',
      },
    }
  );
});

test('OpenTelemetryReporter supports disabling traces with enabled flag', (t) => {
  const tracer = new FakeTracer();
  const restore = installTracerMock(tracer);
  const reporter = new OpenTelemetryReporter({
    traces: {
      enabled: false,
    },
  });

  t.teardown(restore);

  reporter.onBegin(config);
  reporter.onTestBegin(testCase, result);
  reporter.onStepBegin(testCase, result, step);
  reporter.onStepEnd(testCase, result, step);
  reporter.onTestEnd(testCase, result);

  t.is(tracer.spans.length, 0);
});
