# Metrics Architecture & Design
## Playwright OpenTelemetry Reporter - Detailed Technical Design

**Purpose:** Detailed architecture, diagrams, and technical specifications for the metrics system.

**Target Audience:** Architects and senior engineers reviewing the design.

---

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Component Breakdown](#component-breakdown)
3. [Interfaces & Types](#interfaces--types)
4. [Data Flow](#data-flow)
5. [Deployment Architecture](#deployment-architecture)

---

## Design Philosophy

**Metrics-Only Approach:** This library captures test metrics without implementing business logic. Flakiness detection is handled natively by Playwright via test retries—when a test fails on first attempt but passes on retry, Playwright automatically marks it as `'flaky'` in the test result. The library simply reads and exports this data to backends for historical analysis and trend visualization.

---

## System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│         Playwright Test Run                        │
│  ┌──────────────────────────────────────────────┐  │
│  │ Test Lifecycle Events:                       │  │
│  │ - onTestBegin                                │  │
│  │ - onStepBegin / onStepEnd                    │  │
│  │ - onTestEnd                                  │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
    ┌───▼────────┐  │  ┌────▼──────────┐
    │  Tracer    │  │  │MetricsCollector│
    │(existing)  │  │  │   (NEW)        │
    └───┬────────┘  │  └────┬───────────┘
        │            │       │
        └────────────┼───────┘
                     │
        ┌────────────▼──────────┐
        │  Span Processor       │
        │  (optional)           │
        └────────────┬──────────┘
                     │
        ┌────────────▼──────────────┐
        │  OTLP Exporter           │
        │  (traces + metrics)      │
        └──────────────────────────┘
                     │
        ┌────────────▼──────────────────────────┐
        │  OpenTelemetry Collector (Backend)    │
        │  - Jaeger, Datadog, Honeycomb, etc.  │
        └──────────────────────────────────────┘
```

### Layer Architecture

```
┌─────────────────────────────────────────────┐
│  Application Layer                          │
│  - Playwright Tests                         │
│  - Reporter Hook Listeners                  │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│  Instrumentation Layer                      │
│  - OpenTelemetryReporter (existing)         │
│  - MetricsCollector (NEW)                   │
│  - Event Listeners                          │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│  Metrics Processing Layer                   │
│  - MetricRecorder                           │
│  - Percentile Calculators                   │
│  - Attribute Builders                       │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│  Export Layer                               │
│  - MetricsExporterFactory                   │
│  - MetricsExporter (interface)              │
│  - OTLPMetricsExporter (implementation)     │
│  - PrometheusMetricsExporter (future)       │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│  OpenTelemetry SDK Layer                    │
│  - Meter                                    │
│  - MetricReader                             │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│  Backend (External)                         │
│  - OTLP Collector                           │
└─────────────────────────────────────────────┘
```

---

## Component Breakdown

### Component 1: MetricsCollector (Orchestrator)

**Responsibility:** Orchestrate metrics collection across test lifecycle

**Location:** `src/lib/metrics/collector.ts`

**Interface:**
```typescript
interface MetricsCollector {
  // Lifecycle
  initialize(config: MetricsConfig): Promise<void>;
  shutdown(): Promise<void>;
  
  // Recording
  recordTestStart(test: TestCase): void;
  recordTestEnd(test: TestCase, result: TestResult): void;  // Reads flakiness from result
  recordStepStart(step: Step): void;
  recordStepEnd(step: Step): void;
  
  // Retrieval
  getMetrics(): RunMetrics;
  getTestMetric(testId: string): TestMetrics;
}

interface RunMetrics {
  startTime: number;
  endTime: number;
  totalDuration: number;
  testCount: number;
  passedCount: number;
  failedCount: number;
  flakyCount: number;  // From Playwright result.status === 'flaky'
  skippedCount: number;
  testDurationPercentiles: {
    min: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
    p99: number;
    max: number;
  };
  testMetrics: TestMetrics[];
}

interface TestMetrics {
  testId: string;
  testName: string;
  projectName: string;
  duration: number;
  status: 'passed' | 'failed' | 'flaky' | 'skipped';  // Directly from Playwright
  retryCount: number;  // From result.retry
  stepMetrics: StepMetrics[];
}

interface StepMetrics {
  stepName: string;
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
}
```

**Dependencies (Injected):**
- `MetricsExporter` - Sends metrics to backend
- `MetricRecorder` - Records individual metrics

**Responsibilities:**
1. Track test lifecycle (start → end)
2. Read test status from Playwright (includes 'flaky')
3. Calculate test duration and percentiles
4. Count pass/fail/flaky/skip
5. Track step-level metrics
6. Export metrics via exporter

**Implementation Notes:**
- Maintains in-memory state during test run
- Exports metrics incrementally (streaming)
- Thread-safe (if parallel tests enabled)

---

### Component 2: MetricRecorder (Recorder)

**Responsibility:** Record individual metrics (histogram, counter, gauge)

**Location:** `src/lib/metrics/recorder.ts`

**Interface:**
```typescript
interface MetricRecorder {
  recordDuration(
    name: string,
    duration: number,
    attributes: Record<string, string | number>
  ): void;
  
  recordCounter(
    name: string,
    value: number,
    attributes: Record<string, string | number>
  ): void;
  
  recordGauge(
    name: string,
    value: number,
    attributes: Record<string, string | number>
  ): void;
}
```

**Implementation:**
- Wraps OpenTelemetry Meter
- Converts metrics to OTEL format
- Handles attribute serialization
- Batch exports for efficiency

---

### Component 3: MetricsExporter (Abstract Layer)

**Responsibility:** Export metrics to backend

**Location:** `src/lib/metrics/exporters/`

**Interface:**
```typescript
interface MetricsExporter {
  export(metrics: RunMetrics): Promise<void>;
  isHealthy(): boolean;
}
```

**Implementations:**

1. **OTLPMetricsExporter** (Default)
   - Exports to OTLP collector
   - Uses same backend as traces
   - Location: `src/lib/metrics/exporters/otlp.ts`

2. **PrometheusMetricsExporter** (Future)
   - Exports to Prometheus
   - Location: `src/lib/metrics/exporters/prometheus.ts`

3. **CustomMetricsExporter** (Template)
   - Template for teams to implement custom exporters
   - Location: `src/lib/metrics/exporters/custom.template.ts`

**Factory:**
```typescript
interface MetricsExporterFactory {
  createExporter(config: MetricsConfig): MetricsExporter;
}

class DefaultMetricsExporterFactory implements MetricsExporterFactory {
  createExporter(config: MetricsConfig): MetricsExporter {
    switch (config.metricsBackend) {
      case 'otlp':
        return new OTLPMetricsExporter(config.otlpEndpoint);
      case 'prometheus':
        return new PrometheusMetricsExporter(config.promPort);
      case 'custom':
        return new config.customExporter(config);
      default:
        throw new Error(`Unknown backend: ${config.metricsBackend}`);
    }
  }
}
```

---

### Component 5: Configuration System

**Location:** `src/lib/metrics/config.ts`

**Interface:**
```typescript
interface MetricsConfig {
  enabled: boolean;
  backend: 'otlp' | 'prometheus' | 'custom';
  sampleRate?: number; // 0-1, default 1.0
  otlpEndpoint?: string;
  promPort?: number;
  customExporter?: MetricsExporterFactory;
  batchSize?: number; // Default 100
  flushInterval?: number; // Default 5000ms
}
```

**Configuration Sources (Priority):**
1. Environment variables (highest)
2. Config file (`playwright.config.ts`)
3. Defaults (lowest)

**Note:** Flakiness detection is handled by Playwright test retries, not by configuration.

---

## Interfaces & Types

### Full Type Hierarchy

```typescript
// ============== Main Interfaces ==============

interface MetricsCollector {
  initialize(config: MetricsConfig): Promise<void>;
  shutdown(): Promise<void>;
  recordTestStart(test: TestCase): void;
  recordTestEnd(test: TestCase, result: TestResult): void;
  recordStepStart(step: Step): void;
  recordStepEnd(step: Step): void;
  getMetrics(): RunMetrics;
}

interface MetricRecorder {
  recordDuration(name: string, duration: number, attributes?: any): void;
  recordCounter(name: string, value: number, attributes?: any): void;
  recordGauge(name: string, value: number, attributes?: any): void;
}

interface MetricsExporter {
  export(metrics: RunMetrics): Promise<void>;
  isHealthy(): boolean;
}

// ============== Data Types ==============

interface Metric {
  name: string;
  value: number;
  attributes?: Record<string, string | number>;
  timestamp?: number;
}

interface TestCase {
  id: string;
  title: string;
  location?: { file: string; line: number };
  project?: string;
}

interface TestResult {
  passed: boolean;
  failed: boolean;
  skipped: boolean;
  duration: number;
  error?: Error;
  retryCount?: number;
}

interface RunMetrics {
  startTime: number;
  endTime: number;
  totalDuration: number;
  testCount: number;
  passedCount: number;
  failedCount: number;
  flakyCount: number;
  skippedCount: number;
  testDurationPercentiles: {
    min: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
    p99: number;
    max: number;
  };
  testMetrics: TestMetrics[];
}

interface TestMetrics {
  testId: string;
  testName: string;
  projectName: string;
  duration: number;
  status: 'passed' | 'failed' | 'flaky' | 'skipped';  // From Playwright result
  retryCount: number;  // From result.retry
  stepMetrics: StepMetrics[];
}

interface StepMetrics {
  stepName: string;
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
}
```

---

## Data Flow

### Flow 1: Test Lifecycle to Metrics Export

```
1. Playwright fires onTestBegin event
   ↓
2. Reporter notifies listeners (Observer pattern)
   ↓
3. MetricsCollector.recordTestStart() called
   ├─ Stores test ID and start time
   └─ Broadcasts "testStarted" event
   ↓
4. [Test runs...]
   ├─ onStepBegin → MetricsCollector.recordStepStart()
   ├─ [Step runs...]
   └─ onStepEnd → MetricsCollector.recordStepEnd()
   ↓
5. Playwright fires onTestEnd event
   ↓
6. Reporter notifies listeners
   ↓
7. MetricsCollector.recordTestEnd() called
   ├─ Calculates duration = endTime - startTime
   ├─ Records test duration metric
   ├─ Reads status from Playwright (includes 'flaky')
   ├─ Updates pass/fail/flaky counts
   └─ Exports metrics via exporter
   ↓
8. MetricsExporter.export() called
   ├─ Converts metrics to OTEL format
   └─ Sends to backend (OTLP, Prometheus, etc.)
   ↓
9. Backend receives metrics
   ├─ Stores in time-series database
   └─ Aggregates percentiles, trends, etc.
```

### Flow 2: Flakiness Tracking (Playwright Native)

```
Playwright Test Configuration:
  retries: 2  // Enable retries

Test Execution:
  Attempt 1: Test A fails
           ↓ Automatic retry (due to config)
  Attempt 2: Test A passes
           ↓ Status = 'flaky' (Playwright sets this)

Library Processing:
  1. Reads result.status = 'flaky' from Playwright
  2. Reads result.retry = 1 (retry attempt number)
  3. Exports: { status: 'flaky', retryCount: 1 }

Backend Analysis (Historical):
  Day 1: Test A flaky (1 retry needed)
  Day 2: Test A flaky (1 retry needed)
  Day 3: Test A flaky (2 retries needed) → Trend: degrading
  
Grafana shows: Test A failure rate increasing over time
```

---

## Extension Points

### Extension Point 1: Custom Metrics Exporter

```typescript
// Teams implement MetricsExporter
class DatadogMetricsExporter implements MetricsExporter {
  constructor(private apiKey: string) {}
  
  async export(metrics: RunMetrics): Promise<void> {
    const payload = this.convertToDatadogFormat(metrics);
    
    const response = await fetch('https://api.datadoghq.com/api/v1/series', {
      method: 'POST',
      headers: { 'DD-API-KEY': this.apiKey },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      throw new Error(`Datadog export failed: ${response.statusText}`);
    }
  }
  
  isHealthy(): boolean {
    // Ping Datadog to check health
  }
  
  private convertToDatadogFormat(metrics: RunMetrics) {
    // Convert OTEL format to Datadog format
  }
}

// Use in factory
class MetricsExporterFactory {
  createExporter(config: MetricsConfig): MetricsExporter {
    if (config.backend === 'datadog') {
      return new DatadogMetricsExporter(config.ddApiKey!);
    }
    // ... other cases
  }
}
```

### Extension Point 2: Custom Backend Integration

```typescript
// Teams implement custom exporter for their backend
class CustomBackendExporter implements MetricsExporter {
  constructor(private config: CustomBackendConfig) {}
  
  async export(metrics: RunMetrics): Promise<void> {
    // Send metrics to your custom backend
    // Backend handles trend analysis, flakiness detection, alerting
    const payload = this.transformMetrics(metrics);
    await this.send(payload);
  }
  
  isHealthy(): boolean {
    // Health check implementation
  }
  
  private transformMetrics(metrics: RunMetrics) {
    // Custom transformation logic
    return metrics;
  }
}
```

---

## Deployment Architecture

### Development Environment

```
Playwright Tests (local)
    ↓
Reporter (in-process)
    ├─ OpenTelemetryReporter (traces)
    └─ MetricsCollector (metrics)
    ↓
OpenTelemetry SDK (local)
    ↓
OTLP Exporter
    ↓
Docker OpenTelemetry Collector (localhost:4318)
    ↓
Jaeger (http://localhost:16686)
```

**Setup:** `docker-compose up` in `docker/` folder

### CI/CD Environment

```
Playwright Tests (CI runner)
    ↓
Reporter (in-process)
    ├─ OpenTelemetryReporter (traces)
    └─ MetricsCollector (metrics)
    ↓
OpenTelemetry SDK
    ↓
OTLP Exporter
    ↓
OTLP Collector (managed service)
    │
    ├─→ Datadog (production monitoring)
    ├─→ Honeycomb (test analysis)
    └─→ Prometheus (internal metrics)
```

**Environment Variables:**
```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.company.com
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer%20token
METRICS_BACKEND=otlp
METRICS_ENABLED=true
```

**Playwright Configuration (Required for Flakiness Tracking):**
```typescript
// playwright.config.ts
export default defineConfig({
  retries: 2,  // Enable retries to detect flaky tests
  // ...
});
```

### Production Reporting

```
Historical Test Runs (1000s per day)
    ↓
OTLP Collector (aggregates metrics)
    ↓
┌──────────────────────────┬──────────────────────────┐
│                          │                          │
Metrics Database       Traces Database        Logs Storage
(Prometheus/Thanos)    (Jaeger/Grafana)      (ELK/Loki)
    │                      │                          │
    └──────────────────────┼──────────────────────────┘
                           │
                    Dashboard & Alerts
                           │
                    ┌──────┴──────┐
                    │             │
                 Slack        PagerDuty
                 (teams)      (on-call)
```

---

## Summary

**Architecture Highlights:**

- ✅ **Metrics-Only Design** - No business logic, pure data collection
- ✅ **Playwright Native Flakiness** - Leverage `result.status === 'flaky'` from test retries
- ✅ **Layered Design** - Clear separation of concerns
- ✅ **Dependency Injection** - Easy to test and extend
- ✅ **Factory Pattern** - Multiple exporters supported
- ✅ **Interface-Based** - All contracts defined before implementation
- ✅ **Streaming Export** - Incremental metrics (no batch delays)
- ✅ **Configuration-Driven** - Easy to customize per environment
- ✅ **Backend-Agnostic** - Works with any observability platform
- ✅ **Plug-and-Play** - Teams can integrate without forking

**Key Principle:** Library exports raw metrics. Backend handles historical analysis, trend detection, and alerting.

**Next Steps:** See [TDD_STRATEGY.md](TDD_STRATEGY.md) for implementation workflow.
