# Complete Execution Flow: From `npm run playwright` to Metrics Export

This document provides a comprehensive, step-by-step breakdown of how Playwright tests flow through the OpenTelemetry reporter, how metrics are instrumented, and how data eventually gets exported to OpenTelemetry collectors.

---

## Table of Contents

1. [STEP 1: npm run playwright](#step-1-npm-run-playwright-command-executes)
2. [STEP 2: Playwright Config Loading](#step-2-playwright-reads-playwrightconfigts)
3. [STEP 3: Global Setup](#step-3-globalsetupts-runs-before-any-tests)
4. [STEP 4: Reporter Loading](#step-4-playwright-loads-the-reporter)
5. [STEP 5: Reporter Instantiation](#step-5-playwright-instantiates-the-reporter)
6. [STEP 6: Test Suite Begins](#step-6-playwright-begins-test-suite)
7. [STEP 7: Test Starts](#step-7-first-test-starts)
8. [STEP 8: Test Step Runs](#step-8-test-step-runs)
9. [STEP 9: Test Step Ends](#step-9-test-step-ends)
10. [STEP 10: Test Ends](#step-10-test-ends)
11. [STEP 11: All Tests Complete](#step-11-all-tests-complete)
12. [STEP 12: Process Cleanup](#step-12-process-cleanup-automatic)
13. [Complete Wiring Diagram](#complete-wiring-diagram)
14. [Key Sequences by File](#key-sequences-by-file)
15. [The OTEL Endpoint Flow](#the-otel-endpoint-flow)

---

## STEP 1: npm run playwright (Command executes)

```bash
npm run playwright
# From package.json: "playwright": "playwright test"
```

**Loads**: `@playwright/test` CLI

The npm script resolves to the Playwright test runner, which begins initializing the test framework.

---

## STEP 2: Playwright reads playwright.config.ts

**File**: `playwright.config.ts`

```typescript
export default defineConfig({
  testDir: './test/e2e',
  globalSetup: require.resolve('./global-setup'),  // ← KEY: This runs FIRST
  reporter: [['list'], ['.']], // ← KEY: '.' means load from current package
  // ... other config
});
```

**Key Configuration Points**:
- `globalSetup`: Points to `global-setup.ts`, which runs before all tests
- `reporter`: An array specifying multiple reporters:
  - `'list'` — the built-in Playwright list reporter
  - `'.'` — the current package (resolves to `build/main/index.js` from `package.json`)

Playwright parses this configuration to determine:
- Where tests are located
- Which setup/teardown functions to run
- Which reporters to load

---

## STEP 3: global-setup.ts runs (BEFORE any tests)

**File**: `global-setup.ts`

```typescript
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { FullConfig } from '@playwright/test';

import { name as PKG_NAME, version as PKG_VERSION } from './src/lib/version';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: PKG_NAME,
    [ATTR_SERVICE_VERSION]: PKG_VERSION,
  }),
  traceExporter: new OTLPTraceExporter({
    url:
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
      'http://localhost:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ||
        'http://localhost:4318/v1/metrics',
    }),
  }),
});

export default async function globalSetup(_config: FullConfig) {
  sdk.start();  // ← CRITICAL: Starts the OTEL SDK globally

  return async () => {
    await sdk.shutdown();  // Called after all tests
  };
}
```

### What Happens Here

The `NodeSDK` instance is created with:

1. **Resource metadata**: Service name and version are configured, which tags all spans and metrics
2. **Trace Exporter**: `OTLPTraceExporter` configured to send traces to `http://localhost:4318/v1/traces` (OpenTelemetry Collector)
3. **Metrics Reader + Exporter**: `PeriodicExportingMetricReader` wraps `OTLPMetricExporter` to send metrics to `http://localhost:4318/v1/metrics`

### Global OTEL Context Created

Once `sdk.start()` is called:
- A **global tracer** is accessible via `opentelemetry.trace.getTracer()`
- A **global meter** is accessible via `opentelemetry.metrics.getMeter()`
- Both are configured to export to the OTEL Collector

This initialization happens **once per test run**, before any tests are discovered or loaded.

---

## STEP 4: Playwright loads the reporter

**Reporter config**: `reporter: [['list'], ['.']]`

Playwright resolves `'.'` by reading `package.json`:

```json
{
  "main": "build/main/index.js",
  "module": "build/module/index.js"
}
```

The `.` resolves to the `build/main/index.js` entry point.

**File**: `src/index.ts` (compiled to `build/main/index.js`)

```typescript
import OpenTelemetryReporter from './lib/reporter';

export default OpenTelemetryReporter;
export * from './lib/event-listener';
export * from './lib/metrics';
export * from './lib/reporter';
export * from './lib/version';
```

### What Happens

- The reporter module is loaded into memory
- All metrics-related exports are re-exported for external use
- The default export is the `OpenTelemetryReporter` class

---

## STEP 5: Playwright instantiates the reporter

Playwright calls the default export as a constructor:

```javascript
const reporter = new OpenTelemetryReporter(options);
```

**File**: `src/lib/reporter.ts`

```typescript
export interface OpenTelemetryReporterOptions {
  listeners?: TestEventListener[];
  metrics?: false | MetricsConfig;
}

export class OpenTelemetryReporter implements Reporter {
  private config: FullConfig;
  private listeners: TestEventListener[] = [];
  private testSpans: { [key in string]: Span } = {};
  private stepSapns: { [key in string]: Span } = {};
  private tracer: Tracer;

  constructor(options: OpenTelemetryReporterOptions = {}) {
    this.listeners = options.listeners || [];
    
    // STEP 5A: Configure metrics if enabled
    this.configureMetrics(options.metrics);
    
    // STEP 5B: Get tracer from global OTEL SDK
    this.tracer = opentelemetry.trace.getTracer(PKG_NAME, PKG_VERSION);
  }

  private configureMetrics(metricsConfig: false | MetricsConfig = {}): void {
    if (metricsConfig === false || metricsConfig.enabled === false) {
      return; // Metrics disabled
    }

    // STEP 5C: Create exporter
    const exporter =
      metricsConfig.exporter || new OpenTelemetryMetricsExporter();
    
    // STEP 5D: Create collector with exporter
    const collector = new MetricsCollector(
      exporter,
      undefined,
      undefined,
      metricsConfig.attributes
    );

    // STEP 5E: Create and subscribe metrics listener
    this.subscribe(new PlaywrightMetricsListener(collector));
  }

  subscribe(listener: TestEventListener): void {
    this.listeners.push(listener);
  }
}
```

### Constructor Execution Chain

#### 5A: configureMetrics() called

```typescript
this.configureMetrics(options.metrics);
// options.metrics defaults to {} (empty object, meaning metrics enabled with defaults)
```

The method checks if metrics are explicitly disabled:
- If `metricsConfig === false` → skip all metrics setup
- If `metricsConfig.enabled === false` → skip all metrics setup
- Otherwise → configure metrics

#### 5C: Create OpenTelemetryMetricsExporter

**File**: `src/lib/metrics/exporters/opentelemetry.ts`

```typescript
export class OpenTelemetryMetricsExporter implements MetricsExporter {
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();

  constructor(private meter?: Meter) {}

  send(metric: Metric): void {
    if (metric.kind === 'duration') {
      this.getHistogram(metric.name).record(metric.value, metric.attributes);
    } else if (metric.kind === 'counter') {
      this.getCounter(metric.name).add(metric.value, metric.attributes);
    } else {
      this.getGauge(metric.name).record(metric.value, metric.attributes);
    }
  }

  private getMeter(): Meter {
    if (!this.meter) {
      // Gets meter from global OTEL SDK (initialized in global-setup.ts)
      this.meter = opentelemetry.metrics.getMeter(PKG_NAME, PKG_VERSION);
    }
    return this.meter;
  }

  private getHistogram(name: string): Histogram {
    const histogram = this.histograms.get(name);
    if (histogram) {
      return histogram;
    }

    const createdHistogram = this.getMeter().createHistogram(name, {
      unit: 'ms',
    });
    this.histograms.set(name, createdHistogram);
    return createdHistogram;
  }

  // Similar for counters and gauges...
}
```

**What Happens**:
- Exporter instance created
- Meter is fetched lazily (only when first metric is recorded)
- Meter comes from the global OTEL SDK initialized in Step 3

#### 5D: Create MetricsCollector

**File**: `src/lib/metrics/collector.ts`

```typescript
export class MetricsCollector implements IMetricsCollector {
  private runMetrics: RunMetrics;
  private startedTests = new Map<string, number>();
  private activeSteps = new Map<string, ActiveStep>();
  private stepMetrics = new Map<string, StepMetrics[]>();

  constructor(
    private exporter: MetricsExporter,  // OpenTelemetryMetricsExporter
    private recorder: IMetricRecorder = new MetricRecorder(exporter),
    private clock: () => number = Date.now,
    private attributes: TestCase['attributes'] = {}
  ) {
    this.runMetrics = emptyRunMetrics(this.clock());
  }
}
```

**What Happens**:
- Collector created with exporter reference
- Default `MetricRecorder` created
- Empty run metrics initialized with start time
- State maps created for tracking tests and steps

#### 5E: Create MetricRecorder + PlaywrightMetricsListener

**File**: `src/lib/metrics/recorder.ts`

```typescript
export class MetricRecorder implements IMetricRecorder {
  constructor(
    private exporter: MetricsExporter,
    private clock: () => number = Date.now
  ) {}

  recordDuration(
    name: string,
    duration: number,
    attributes: MetricAttributes = {}
  ): void {
    this.record('duration', name, duration, attributes);
  }

  recordCounter(
    name: string,
    value = 1,
    attributes: MetricAttributes = {}
  ): void {
    this.record('counter', name, value, attributes);
  }

  recordGauge(
    name: string,
    value: number,
    attributes: MetricAttributes = {}
  ): void {
    this.record('gauge', name, value, attributes);
  }

  private record(
    kind: MetricKind,
    name: string,
    value: number,
    attributes: MetricAttributes
  ): void {
    const metric: Metric = {
      name,
      kind,
      value,
      attributes,
      timestamp: this.clock(),
    };
    this.exporter.send(metric); // Sends to exporter
  }
}
```

**File**: `src/lib/metrics/playwright-listener.ts`

```typescript
export class PlaywrightMetricsListener implements TestEventListener {
  private config: FullConfig;

  constructor(private collector: MetricsCollector) {}

  onBegin(config: FullConfig): void {
    this.config = config;
  }

  onTestBegin(test: PlaywrightTestCase): void {
    this.collector.recordTestStart(this.toMetricTestCase(test));
  }

  onTestEnd(test: PlaywrightTestCase, result: PlaywrightTestResult): void {
    this.collector.recordTestEnd(this.toMetricTestCase(test), {
      duration: result.duration,
      retry: result.retry,
      status: this.toMetricTestStatus(test, result),
    });
  }

  onStepBegin(...): void {
    this.collector.recordStepStart(...);
  }

  onStepEnd(...): void {
    this.collector.recordStepEnd(...);
  }

  async onEnd(): Promise<void> {
    await this.collector.shutdown();
  }
}
```

**What Happens**:
- Listener created with collector reference
- Listener added to reporter's listeners array via `this.subscribe(listener)`
- Listener is now wired into the test lifecycle

#### 5B: Get Tracer from Global SDK

```typescript
this.tracer = opentelemetry.trace.getTracer(PKG_NAME, PKG_VERSION);
```

**What Happens**:
- Retrieves the global tracer created in Step 3 (`global-setup.ts`)
- This tracer is used to create spans for tests and steps (tracing, not metrics)
- Tracer operates independently of metrics

### Constructor Complete

At this point:
- ✅ Reporter instantiated
- ✅ Metrics pipeline wired up (if enabled)
- ✅ Metrics listener subscribed to reporter
- ✅ Tracer retrieved from global SDK
- ✅ Reporter ready to receive test events

---

## STEP 6: Playwright begins test suite

Playwright calls the reporter's lifecycle method:

**File**: `src/lib/reporter.ts`

```typescript
onBegin(config: FullConfig, suite?: Suite): void {
  this.config = config;
  // Notify all listeners
  this.listeners.forEach((listener) => listener.onBegin?.(config, suite));
}
```

### Execution Chain

1. Reporter stores the full Playwright config
2. Reporter iterates through all listeners and calls `onBegin()`
3. `PlaywrightMetricsListener.onBegin()` stores config for later use

**What Happens**:
- ✅ Reporter has access to full test configuration
- ✅ Listeners are notified of test suite start
- ✅ Metrics listener stores config for formatting test names

---

## STEP 7: First test starts

**Test File**: `test/e2e/example.spec.ts`

```typescript
test('has title', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  await expect(page).toHaveTitle(/Playwright/);
});
```

Playwright calls:

**File**: `src/lib/reporter.ts`

```typescript
onTestBegin(test: TestCase, result: TestResult): void {
  // NOTIFY METRICS LISTENER
  this.listeners.forEach((listener) => listener.onTestBegin?.(test, result));

  // CREATE TEST SPAN (tracing, not metrics)
  const testSpan = this.tracer.startSpan(
    formatTestTitle(this.config, test),
    { startTime: result.startTime }
  );
  this.testSpans[test.id] = testSpan;
}
```

### Execution Chain

#### Phase 1: Notify Listeners

Reporter calls `listener.onTestBegin(test, result)` for each listener.

**File**: `src/lib/metrics/playwright-listener.ts`

```typescript
onTestBegin(test: PlaywrightTestCase): void {
  this.collector.recordTestStart(this.toMetricTestCase(test));
}
```

#### Phase 2: Collector Records Test Start

**File**: `src/lib/metrics/collector.ts`

```typescript
recordTestStart(test: TestCase): void {
  this.startedTests.set(test.id, this.clock());
}
```

**What Happens**:
- Current timestamp recorded in `startedTests` map
- Test ID is the key
- This timestamp will be used to calculate test duration later

#### Phase 3: Reporter Creates Test Span

```typescript
const testSpan = this.tracer.startSpan(
  formatTestTitle(this.config, test),
  { startTime: result.startTime }
);
this.testSpans[test.id] = testSpan;
```

**What Happens**:
- ✅ Test start time recorded
- ✅ Test span created in tracing system (independent of metrics)
- ✅ Span stored for later reference

---

## STEP 8: Test step runs

As the test executes, each step triggers events:

```typescript
test('has title', async ({ page }) => {
  await page.goto('https://playwright.dev/');  // ← This is a step
  await expect(page).toHaveTitle(/Playwright/); // ← This is a step
});
```

Playwright calls:

**File**: `src/lib/reporter.ts`

```typescript
onStepBegin(test: TestCase, _result: TestResult, step: TestStep): void {
  // NOTIFY METRICS LISTENER
  this.listeners.forEach((listener) =>
    listener.onStepBegin?.(test, _result, step)
  );

  // DETERMINE PARENT SPAN
  const parent =
    step.parent === undefined
      ? this.testSpans[test.id]
      : this.stepSapns[getHashFromStepTitle(test, step.parent, this.config)];

  const stepHash = getHashFromStepTitle(test, step, this.config);

  // SET SPAN CONTEXT
  const ctx = opentelemetry.trace.setSpan(
    opentelemetry.context.active(),
    parent
  );

  // CREATE STEP SPAN
  const stepSpan = this.tracer.startSpan(
    `Step: ${step.title}`,
    { startTime: step.startTime },
    ctx
  );

  this.stepSapns[stepHash] = stepSpan;
}
```

### Execution Chain

#### Phase 1: Notify Metrics Listener

**File**: `src/lib/metrics/playwright-listener.ts`

```typescript
onStepBegin(
  test: PlaywrightTestCase,
  _result: PlaywrightTestResult,
  step: PlaywrightTestStep
): void {
  this.collector.recordStepStart(
    this.toMetricTestCase(test),
    this.toMetricStep(test, step)
  );
}
```

#### Phase 2: Collector Records Step Start

**File**: `src/lib/metrics/collector.ts`

```typescript
recordStepStart(test: TestCase, step: TestStep): void {
  this.activeSteps.set(this.getStepKey(test.id, step), {
    startedAt: this.clock(),
  });
}
```

**What Happens**:
- Current timestamp recorded in `activeSteps` map
- Step key is combination of test ID and step ID/title
- This timestamp will be used to calculate step duration

#### Phase 3: Reporter Creates Step Span

```typescript
const stepSpan = this.tracer.startSpan(
  `Step: ${step.title}`,
  { startTime: step.startTime },
  ctx
);
this.stepSapns[stepHash] = stepSpan;
```

**What Happens**:
- ✅ Step start time recorded
- ✅ Step span created with parent context (nested in test span)
- ✅ Span stored for later reference

---

## STEP 9: Test step ends

Playwright calls:

**File**: `src/lib/reporter.ts`

```typescript
onStepEnd(test: TestCase, _result: TestResult, step: TestStep): void {
  // NOTIFY METRICS LISTENER
  this.listeners.forEach((listener) =>
    listener.onStepEnd?.(test, _result, step)
  );

  // END STEP SPAN
  const stepSpan =
    this.stepSapns[getHashFromStepTitle(test, step, this.config)];
  if (stepSpan) {
    stepSpan.setAttributes({
      'test.step.category': step.category,
      'test.step.name': step.title,
    });
    if (step.location) {
      stepSpan.setAttributes({
        [ATTR_CODE_FILEPATH]: step.location.file,
        [ATTR_CODE_LINENO]: step.location.line,
        [ATTR_CODE_COLUMN]: step.location.column,
      });
    }
    if (step.error) {
      stepSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: step.error?.message || '',
      });
    }
    stepSpan.end(step.startTime.getTime() + step.duration);
  }
}
```

### Execution Chain - THIS IS WHERE METRICS ARE RECORDED

#### Phase 1: Notify Metrics Listener

**File**: `src/lib/metrics/playwright-listener.ts`

```typescript
onStepEnd(
  test: PlaywrightTestCase,
  _result: PlaywrightTestResult,
  step: PlaywrightTestStep
): void {
  this.collector.recordStepEnd(
    this.toMetricTestCase(test),
    this.toMetricStep(test, step)
  );
}
```

#### Phase 2: Collector Records Step End and Sends Metric

**File**: `src/lib/metrics/collector.ts`

```typescript
recordStepEnd(test: TestCase, step: TestStep): void {
  const stepKey = this.getStepKey(test.id, step);
  const activeStep = this.activeSteps.get(stepKey);
  
  // CALCULATE DURATION
  const duration =
    step.duration === undefined
      ? this.clock() - (activeStep?.startedAt || this.clock())
      : step.duration;
  
  // CREATE STEP METRICS OBJECT
  const metrics: StepMetrics = {
    stepId: step.id || step.title,
    stepName: step.title,
    category: step.category,
    duration,
    status: step.status || 'passed',
  };
  
  // STORE STEP METRICS
  const testSteps = this.stepMetrics.get(test.id) || [];
  testSteps.push(metrics);
  this.stepMetrics.set(test.id, testSteps);
  this.activeSteps.delete(stepKey);

  // ← SENDS METRIC TO RECORDER
  this.recorder.recordDuration(
    METRIC_TEST_STEP_DURATION,  // 'playwright.test.step.duration'
    duration,
    this.withAttributes(test, {
      [ATTR_TEST_CASE_NAME]: test.title,
      [ATTR_TEST_STEP_NAME]: step.title,
      [ATTR_TEST_STEP_CATEGORY]: step.category || 'unknown',
    })
  );
}
```

#### Phase 3: Recorder Creates Metric Object and Sends to Exporter

**File**: `src/lib/metrics/recorder.ts`

```typescript
recordDuration(
  name: string,
  duration: number,
  attributes: MetricAttributes = {}
): void {
  this.record('duration', name, duration, attributes);
}

private record(
  kind: MetricKind,
  name: string,
  value: number,
  attributes: MetricAttributes
): void {
  const metric: Metric = {
    name,           // 'playwright.test.step.duration'
    kind,           // 'duration'
    value,          // actual step duration in milliseconds
    attributes,     // test name, step name, category, etc.
    timestamp: this.clock(),
  };
  this.exporter.send(metric);  // ← Sends to OpenTelemetryMetricsExporter
}
```

#### Phase 4: Exporter Records Metric to OTEL Meter

**File**: `src/lib/metrics/exporters/opentelemetry.ts`

```typescript
send(metric: Metric): void {
  if (metric.kind === 'duration') {
    this.getHistogram(metric.name).record(
      metric.value,
      metric.attributes
    );
  }
}

private getHistogram(name: string): Histogram {
  const histogram = this.histograms.get(name);

  if (histogram) {
    return histogram;
  }

  // ← Gets meter from global OTEL SDK (initialized in global-setup.ts)
  const createdHistogram = this.getMeter().createHistogram(name, {
    unit: 'ms',
  });
  this.histograms.set(name, createdHistogram);
  return createdHistogram;
}

private getMeter(): Meter {
  if (!this.meter) {
    this.meter = opentelemetry.metrics.getMeter(PKG_NAME, PKG_VERSION);
  }
  return this.meter;
}
```

**What Happens at This Point**:
- ✅ Step duration calculated (from start to end)
- ✅ Step metrics object created and stored
- ✅ Metric object created with name, kind, value, and attributes
- ✅ Metric sent to exporter
- ✅ Histogram retrieved (or created) from global OTEL meter
- ✅ Value recorded to histogram
- ✅ **Metric is now in the global OTEL meter** (waiting for periodic export)
- ✅ Reporter ends step span

---

## STEP 10: Test ends

Playwright calls:

**File**: `src/lib/reporter.ts`

```typescript
onTestEnd(test: TestCase, result: TestResult): void {
  // NOTIFY METRICS LISTENER
  this.listeners.forEach((listener) => listener.onTestEnd?.(test, result));

  // END TEST SPAN
  const testSpan = this.testSpans[test.id];
  if (testSpan) {
    const isPassing =
      result.status === 'skipped' || result.status === test.expectedStatus;

    testSpan.setAttributes({
      [ATTR_TEST_CASE_NAME]: formatTestTitle(this.config, test),
      [ATTR_TEST_CASE_RESULT_STATUS]: isPassing ? 'pass' : 'fail',
      [ATTR_TEST_SUITE_NAME]: test.parent.title,
      [ATTR_CODE_FILEPATH]: test.location.file,
      [ATTR_CODE_LINENO]: test.location.line,
      [ATTR_CODE_COLUMN]: test.location.column,
    });

    if (!isPassing) {
      testSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: result.error?.message || '',
      });
    }
    testSpan.end(result.startTime.getTime() + result.duration);
  }
}
```

### Execution Chain - RECORDS TWO METRICS

#### Phase 1: Notify Metrics Listener

**File**: `src/lib/metrics/playwright-listener.ts`

```typescript
onTestEnd(test: PlaywrightTestCase, result: PlaywrightTestResult): void {
  this.collector.recordTestEnd(this.toMetricTestCase(test), {
    duration: result.duration,
    retry: result.retry,
    status: this.toMetricTestStatus(test, result),
  });
}
```

#### Phase 2: Collector Records Test End and Sends Metrics

**File**: `src/lib/metrics/collector.ts`

```typescript
recordTestEnd(test: TestCase, result: TestResult): void {
  // CALCULATE DURATION
  const duration = this.getDuration(test.id, result.duration);
  
  // CREATE TEST METRICS OBJECT
  const testMetrics: TestMetrics = {
    testId: test.id,
    testName: test.title,
    projectName: test.projectName,
    suiteName: test.suiteName,
    duration,
    status: result.status,
    retryCount: result.retry || 0,
    stepMetrics: this.stepMetrics.get(test.id) || [],
  };

  // STORE TEST METRICS
  this.runMetrics.testMetrics.push(testMetrics);
  this.runMetrics.testCount += 1;
  this.runMetrics.endTime = this.clock();
  this.runMetrics.totalDuration =
    this.runMetrics.endTime - this.runMetrics.startTime;
  
  // UPDATE STATUS COUNTERS
  this.incrementStatusCount(result.status);
  this.runMetrics.testDurationPercentiles = calculateDurationPercentiles(
    this.runMetrics.testMetrics.map((metrics) => metrics.duration)
  );

  // ← SENDS TEST DURATION METRIC (HISTOGRAM)
  this.recorder.recordDuration(
    METRIC_TEST_DURATION,  // 'playwright.test.duration'
    duration,
    this.withAttributes(test, {
      [ATTR_TEST_CASE_NAME]: test.title,
      [ATTR_TEST_RESULT_STATUS]: result.status,
      [ATTR_TEST_RETRY_COUNT]: result.retry || 0,
    })
  );

  // ← SENDS TEST COUNT METRIC (COUNTER)
  this.recorder.recordCounter(
    METRIC_TEST_COUNT,  // 'playwright.test.count'
    1,
    this.withAttributes(test, {
      [ATTR_TEST_CASE_NAME]: test.title,
      [ATTR_TEST_RESULT_STATUS]: result.status,
      [ATTR_TEST_RETRY_COUNT]: result.retry || 0,
    })
  );

  // CLEANUP
  this.startedTests.delete(test.id);
  this.stepMetrics.delete(test.id);
}
```

**Metric 1: Test Duration (Histogram)**

```typescript
this.recorder.recordDuration(METRIC_TEST_DURATION, duration, attributes);
// name: 'playwright.test.duration'
// kind: 'duration'
// value: milliseconds
// attributes: test name, result status, retry count
```

**Metric 2: Test Count (Counter)**

```typescript
this.recorder.recordCounter(METRIC_TEST_COUNT, 1, attributes);
// name: 'playwright.test.count'
// kind: 'counter'
// value: 1 (incremented for each test)
// attributes: test name, result status, retry count
```

#### Phase 3: Recorder Sends Both Metrics

Both metrics follow the same flow as step metrics:

```typescript
private record(kind, name, value, attributes): void {
  const metric = { name, kind, value, attributes, timestamp };
  this.exporter.send(metric);  // → OpenTelemetryMetricsExporter
}
```

#### Phase 4: Exporter Records Both Metrics

```typescript
send(metric: Metric): void {
  if (metric.kind === 'duration') {
    this.getHistogram(metric.name).record(metric.value, metric.attributes);
  } else if (metric.kind === 'counter') {
    this.getCounter(metric.name).add(metric.value, metric.attributes);
  }
}
```

**What Happens**:
- ✅ Test duration histogram recorded
- ✅ Test count counter recorded
- ✅ Both metrics in OTEL meter (waiting for periodic export)
- ✅ Reporter ends test span

---

## STEP 11: All tests complete

After all tests have run, Playwright calls:

**File**: `src/lib/reporter.ts`

```typescript
async onEnd(result: FullResult): Promise<void> {
  await Promise.all(
    this.listeners.map((listener) => listener.onEnd?.(result))
  );
}
```

### Execution Chain

#### Phase 1: Notify All Listeners

**File**: `src/lib/metrics/playwright-listener.ts`

```typescript
async onEnd(): Promise<void> {
  await this.collector.shutdown();
}
```

#### Phase 2: Collector Shutdown

**File**: `src/lib/metrics/collector.ts`

```typescript
async shutdown(): Promise<void> {
  await this.exporter.shutdown?.();
}
```

**What Happens**:
- ✅ All test metrics collected and aggregated
- ✅ Metrics remain in OTEL meter (not explicitly flushed here)
- ✅ Custom exporter cleanup (if `shutdown()` method exists)

---

## STEP 12: Process cleanup (automatic)

After the reporter completes, Playwright exits, triggering the cleanup function returned from `global-setup.ts`:

**File**: `global-setup.ts`

```typescript
export default async function globalSetup(_config: FullConfig) {
  sdk.start();

  return async () => {
    await sdk.shutdown();  // ← Called NOW as Playwright exits
  };
}
```

### What Happens

```typescript
await sdk.shutdown();
```

The OTEL SDK shutdown process:

1. **Metric Flush**: Flushes all accumulated metrics from meter to the `PeriodicExportingMetricReader`
2. **Metric Export**: Reader sends all metrics to `OTLPMetricExporter`
3. **HTTP POST**: Exporter sends data to `http://localhost:4318/v1/metrics`
4. **Trace Flush**: Flushes all accumulated traces to `OTLPTraceExporter`
5. **HTTP POST**: Exporter sends traces to `http://localhost:4318/v1/traces`
6. **Graceful Shutdown**: SDK closes connections and exits

**What Happens**:
- ✅ All metrics exported to OpenTelemetry Collector
- ✅ All traces exported to OpenTelemetry Collector
- ✅ Process exits cleanly

---

## Complete Wiring Diagram

```
npm run playwright
    ↓
playwright.config.ts (loads global-setup)
    ↓
global-setup.ts
    ├─ NodeSDK.start()
    ├─ Tracer created (available globally)
    └─ Meter created (available globally)
    ↓
Playwright loads reporter from package.json
    ↓
src/index.ts → src/lib/reporter.ts
    ├─ new OpenTelemetryReporter(options)
    │   ├─ configureMetrics(options.metrics)
    │   │   ├─ new OpenTelemetryMetricsExporter()
    │   │   ├─ new MetricsCollector(exporter)
    │   │   │   └─ new MetricRecorder(exporter)
    │   │   └─ new PlaywrightMetricsListener(collector)
    │   │       └─ this.subscribe(listener)
    │   └─ this.tracer = opentelemetry.trace.getTracer()
    │
    └─ constructor complete, reporter ready
    ↓
Playwright runs tests
    ├─ reporter.onBegin()
    │   └─ listener.onBegin()
    │
    ├─ reporter.onTestBegin()
    │   ├─ listener.onTestBegin()
    │   │   └─ collector.recordTestStart()
    │   └─ tracer.startSpan() [TRACING]
    │
    ├─ reporter.onStepBegin()
    │   ├─ listener.onStepBegin()
    │   │   └─ collector.recordStepStart()
    │   └─ tracer.startSpan() [TRACING]
    │
    ├─ reporter.onStepEnd()
    │   ├─ listener.onStepEnd()
    │   │   ├─ collector.recordStepEnd()
    │   │   │   └─ recorder.recordDuration()
    │   │   │       └─ exporter.send(metric)
    │   │   │           └─ meter.createHistogram().record()
    │   │   │               └─ OTEL METER (from global SDK)
    │   │   └─ [metric queued for periodic export by SDK]
    │   └─ stepSpan.end() [TRACING]
    │
    ├─ reporter.onTestEnd()
    │   ├─ listener.onTestEnd()
    │   │   ├─ collector.recordTestEnd()
    │   │   │   ├─ recorder.recordDuration(TEST_DURATION)
    │   │   │   │   └─ meter.createHistogram().record()
    │   │   │   └─ recorder.recordCounter(TEST_COUNT)
    │   │   │       └─ meter.createCounter().add()
    │   │   └─ [both metrics queued for periodic export by SDK]
    │   └─ testSpan.end() [TRACING]
    │
    └─ reporter.onEnd()
        └─ listener.onEnd()
            └─ collector.shutdown()
    ↓
Playwright exits, triggering cleanup
    ↓
global-setup cleanup
    └─ sdk.shutdown()
        ├─ Flushes all metrics to PeriodicExportingMetricReader
        ├─ Reader sends all metrics to OTLPMetricExporter
        ├─ Exporter POSTs to http://localhost:4318/v1/metrics
        ├─ Flushes all traces to OTLPTraceExporter
        ├─ Exporter POSTs to http://localhost:4318/v1/traces
        └─ Process exits
    ↓
OpenTelemetry Collector (receives OTLP data)
    ├─ Receives metrics at /v1/metrics endpoint
    ├─ Receives traces at /v1/traces endpoint
    ├─ Processes through pipelines (e.g., logging, batching)
    └─ Exports to configured backends (Prometheus, Jaeger, etc.)
    ↓
Prometheus (docker-compose service)
    ├─ Scrapes metrics from collector:9464/metrics
    ├─ Stores metrics in ./data/wal/ and ./data/chunks_head/
    └─ Metrics queryable via http://localhost:9090
    ↓
Grafana (docker-compose service)
    ├─ Connects to Prometheus datasource
    ├─ Queries and visualizes metrics
    └─ Accessible at http://localhost:3000
```

---

## Key Sequences by File

### **Initial Setup**

**On first `npm run playwright`**:
1. `global-setup.ts` → `NodeSDK.start()` creates global tracer + meter

### **Reporter Initialization**

**When Playwright loads reporter**:
2. `src/index.ts` → re-exports reporter + metrics
3. `src/lib/reporter.ts` → constructor calls `configureMetrics()`
4. `src/lib/metrics/exporters/opentelemetry.ts` → created (meter fetched lazily)
5. `src/lib/metrics/collector.ts` → created
6. `src/lib/metrics/recorder.ts` → created
7. `src/lib/metrics/playwright-listener.ts` → created and subscribed

### **Test Lifecycle with Metrics**

**For each test**:
8. `src/lib/reporter.ts` → `onTestBegin()`
9. → `src/lib/metrics/playwright-listener.ts` → `onTestBegin()`
10. → `src/lib/metrics/collector.ts` → `recordTestStart()`

**For each step within test**:
11. `src/lib/reporter.ts` → `onStepBegin()` → `onStepEnd()`
12. → `src/lib/metrics/playwright-listener.ts` → `onStepBegin()` / `onStepEnd()`
13. → `src/lib/metrics/collector.ts` → `recordStepStart()` / `recordStepEnd()`
14. → `src/lib/metrics/recorder.ts` → `recordDuration()`
15. → `src/lib/metrics/exporters/opentelemetry.ts` → `send(metric)`
16. → **OTEL meter** → records to histogram (from global SDK)
17. → **SDK periodically exports metrics** (configured in `global-setup.ts`)

**When test ends**:
18. `src/lib/reporter.ts` → `onTestEnd()`
19. → `src/lib/metrics/playwright-listener.ts` → `onTestEnd()`
20. → `src/lib/metrics/collector.ts` → `recordTestEnd()`
21. → `src/lib/metrics/recorder.ts` → `recordDuration()` + `recordCounter()`
22. → `src/lib/metrics/exporters/opentelemetry.ts` → sends both metrics to meter

### **Shutdown**

**All tests complete**:
23. `src/lib/reporter.ts` → `onEnd()`
24. → `src/lib/metrics/playwright-listener.ts` → `onEnd()`
25. → `src/lib/metrics/collector.ts` → `shutdown()`
26. → `global-setup.ts` → `sdk.shutdown()`
27. → **SDK flushes and exports all remaining metrics and traces**

---

## The OTEL Endpoint Flow

### Metrics Path

```
OTEL Meter (created in global-setup.ts)
  ↓
Histogram / Counter / Gauge (created on-demand by exporter)
  ↓
PeriodicExportingMetricReader (configured in global-setup.ts)
  ↓ (every interval or on shutdown)
OTLPMetricExporter (configured in global-setup.ts)
  ↓ (HTTP POST with aggregated metrics)
http://localhost:4318/v1/metrics
  ↓
OpenTelemetry Collector (in docker-compose.local-otel.yml)
  ↓ (scraping pipeline)
Prometheus Service (prom/prometheus:v2.55.0)
  ↓ (HTTP scrape from collector:9464/metrics)
./data/wal/ and ./data/chunks_head/ (TSDB storage)
  ↓
http://localhost:9090/query (Prometheus UI)
  ↓
Grafana Service (grafana/grafana:11.3.0)
  ↓ (queries Prometheus datasource)
http://localhost:3000 (Grafana dashboard)
```

### Traces Path

```
OTEL Tracer (created in global-setup.ts)
  ↓
Spans (created during test execution)
  ├─ Test spans (from reporter.onTestBegin/onTestEnd)
  └─ Step spans (from reporter.onStepBegin/onStepEnd)
  ↓
OTLPTraceExporter (configured in global-setup.ts)
  ↓ (HTTP POST with spans)
http://localhost:4318/v1/traces
  ↓
OpenTelemetry Collector (in docker-compose.local-otel.yml)
  ↓
Jaeger Service (jaegertracing/all-in-one:1.60)
  ↓
http://localhost:16686 (Jaeger UI - trace visualization)
```

---

## Summary: Key Insights

1. **Global Setup is Critical**: `global-setup.ts` initializes the OTEL SDK globally, making tracer and meter available to the reporter
2. **Listener Pattern**: The reporter uses listeners (Observer pattern) to decouple tracing from metrics
3. **Metrics are Event-Driven**: Metrics are recorded reactively as test lifecycle events fire
4. **Recorder Abstraction**: `MetricRecorder` abstracts metric creation, allowing different exporters to plug in
5. **Lazy Meter Retrieval**: The meter is only fetched from the global SDK when the first metric is recorded
6. **Periodic Export**: The OTEL SDK handles periodic metric/trace export automatically
7. **Graceful Shutdown**: All metrics and traces are flushed when `sdk.shutdown()` is called
8. **Dual Instrumentation**: The reporter creates both traces (for observability) and metrics (for aggregation) independently

---

## How Metrics Are Created

### Flow in Simple Terms

1. **Test starts** → `onTestBegin()` fires → Listener notified → `recordTestStart()` stores timestamp
2. **Step starts** → `onStepBegin()` fires → Listener notified → `recordStepStart()` stores timestamp
3. **Step ends** → `onStepEnd()` fires → Listener notified → `recordStepEnd()` calculates duration
4. **Duration sent to Recorder** → Recorder packages as `Metric` object
5. **Metric sent to Exporter** → Exporter retrieves meter from global SDK
6. **Meter records histogram** → Histogram accumulates values
7. **Periodic export** → SDK periodically sends all meter data to endpoint
8. **Endpoint receives data** → Collector processes and forwards to storage (Prometheus)
9. **Prometheus stores** → Data persisted in TSDB (`./data/`)
10. **Grafana queries** → Metrics visualized on dashboard

---

## Configuration Points

Users can customize this flow:

1. **Disable metrics entirely**:
   ```typescript
   new OpenTelemetryReporter({ metrics: false })
   ```

2. **Provide custom exporter**:
   ```typescript
   new OpenTelemetryReporter({
     metrics: {
       exporter: new CustomMetricsExporter()
     }
   })
   ```

3. **Add custom attributes**:
   ```typescript
   new OpenTelemetryReporter({
     metrics: {
       attributes: { environment: 'production' }
     }
   })
   ```

4. **Configure OTEL endpoints** (via environment variables in `global-setup.ts`):
   ```bash
   OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://otel-collector.company.com:4318/v1/traces
   OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=https://otel-collector.company.com:4318/v1/metrics
   ```

---

**End of Flow Documentation**
