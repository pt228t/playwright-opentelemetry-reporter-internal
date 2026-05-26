# Design Patterns & Principles Guide
## Playwright OpenTelemetry Reporter - Metrics Implementation

**Purpose:** This document explains the design patterns used in the metrics system to ensure reusability, testability, and scalability.

**Target Audience:** Senior engineers, architects, and teams extending the metrics system.

---

## Table of Contents
1. [Overview](#overview)
2. [Design Patterns Explained](#design-patterns-explained)
3. [SOLID Principles](#solid-principles)
4. [Real-World Examples](#real-world-examples)
5. [When to Use Each Pattern](#when-to-use-each-pattern)
6. [Common Mistakes](#common-mistakes)

---

## Overview

We use **5 core design patterns** to build the metrics system:

| Pattern | Purpose | Benefit |
|---------|---------|---------|
| **Dependency Injection** | Pass dependencies instead of creating inside | Testability, Flexibility |
| **Factory Pattern** | Centralize object creation | Extensibility, Configuration |
| **Observer Pattern** | Decouple publishers from listeners | Modularity, Event-driven |
| **Strategy Pattern** | Plug in different algorithms | Flexibility, No if-else |
| **Interface-Based** | Define contracts before implementation | SOLID, Loose coupling |

---

## Design Patterns Explained

### 1. Dependency Injection (DI)

#### What It Is
Instead of a class creating its own dependencies, pass them from the outside.

#### Why It Matters
- **Testability:** Replace real dependencies with mocks in tests
- **Flexibility:** Swap implementations without changing the class
- **Clarity:** Dependencies are explicit in the constructor

#### Example: Without DI (❌ BAD)

```typescript
// MetricsCollector creates its own exporter - TIGHTLY COUPLED
class MetricsCollector {
  private exporter: MetricsExporter;
  
  constructor() {
    // Always creates OTLP exporter - can't test without real backend
    this.exporter = new OTLPMetricsExporter({
      endpoint: 'http://localhost:4318',
    });
  }
  
  recordMetric(metric: Metric) {
    this.exporter.send(metric); // Hard to mock in tests
  }
}

// Testing nightmare
test('recordMetric', () => {
  const collector = new MetricsCollector(); // Connects to real backend!
  collector.recordMetric({ name: 'test', value: 100 });
  // Test is slow, flaky, requires running backend
});
```

#### Example: With DI (✅ GOOD)

```typescript
// MetricsExporter interface - define the contract
interface MetricsExporter {
  send(metric: Metric): Promise<void>;
}

// MetricsCollector receives exporter from outside - LOOSELY COUPLED
class MetricsCollector {
  constructor(private exporter: MetricsExporter) {
    // Exporter is injected - can be anything implementing the interface
  }
  
  recordMetric(metric: Metric) {
    this.exporter.send(metric);
  }
}

// Testing is easy
test('recordMetric', () => {
  const mockExporter: MetricsExporter = {
    send: jest.fn().mockResolvedValue(undefined),
  };
  
  const collector = new MetricsCollector(mockExporter);
  collector.recordMetric({ name: 'test', value: 100 });
  
  expect(mockExporter.send).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'test', value: 100 })
  );
});
```

#### Best Practices
```typescript
// ✅ DO: Inject at constructor time
class MetricsCollector {
  constructor(private exporter: MetricsExporter) {}
}

// ❌ DON'T: Inject at method time (creates confusion)
class MetricsCollector {
  recordMetric(metric: Metric, exporter: MetricsExporter) {
    exporter.send(metric);
  }
}

// ❌ DON'T: Use a service locator (hides dependencies)
class MetricsCollector {
  record(metric: Metric) {
    const exporter = ServiceLocator.getExporter(); // Where did this come from?
  }
}
```

---

### 2. Factory Pattern

#### What It Is
Centralize object creation logic. Instead of `new ClassName()` everywhere, use a factory method/class.

#### Why It Matters
- **Extensibility:** Add new types without changing calling code
- **Configuration-Driven:** Choose implementation based on config
- **Complexity Hiding:** Complex initialization logic in one place

#### Example: Without Factory (❌ BAD)

```typescript
// Multiple places need to decide which exporter to create
class Reporter {
  private exporter: MetricsExporter;
  
  constructor(config: Config) {
    // Decision logic scattered everywhere
    if (config.metricsBackend === 'otlp') {
      this.exporter = new OTLPMetricsExporter(config.otlpEndpoint);
    } else if (config.metricsBackend === 'prometheus') {
      this.exporter = new PrometheusMetricsExporter(config.promPort);
    } else if (config.metricsBackend === 'datadog') {
      this.exporter = new DatadogMetricsExporter(config.ddApiKey);
    }
  }
}

class MetricsCollector {
  private exporter: MetricsExporter;
  
  constructor(config: Config) {
    // Same decision logic duplicated here too!
    if (config.metricsBackend === 'otlp') {
      this.exporter = new OTLPMetricsExporter(config.otlpEndpoint);
    } else if (config.metricsBackend === 'prometheus') {
      // ...
    }
  }
}

// If you add a new backend, you have to update Reporter AND MetricsCollector!
// Risk of inconsistency, duplication, and bugs.
```

#### Example: With Factory (✅ GOOD)

```typescript
// Factory interface - define the contract for creating exporters
interface MetricsExporterFactory {
  createExporter(config: Config): MetricsExporter;
}

// Concrete factory - implements the decision logic
class DefaultMetricsExporterFactory implements MetricsExporterFactory {
  createExporter(config: Config): MetricsExporter {
    // All decision logic in one place
    switch (config.metricsBackend) {
      case 'otlp':
        return new OTLPMetricsExporter(config.otlpEndpoint);
      case 'prometheus':
        return new PrometheusMetricsExporter(config.promPort);
      case 'datadog':
        return new DatadogMetricsExporter(config.ddApiKey);
      default:
        throw new Error(`Unknown backend: ${config.metricsBackend}`);
    }
  }
}

// Reporter uses factory - DI + Factory combined!
class Reporter {
  private exporter: MetricsExporter;
  
  constructor(config: Config, factory: MetricsExporterFactory) {
    this.exporter = factory.createExporter(config);
  }
}

// MetricsCollector uses factory - consistent behavior
class MetricsCollector {
  private exporter: MetricsExporter;
  
  constructor(config: Config, factory: MetricsExporterFactory) {
    this.exporter = factory.createExporter(config);
  }
}

// To add a new backend:
// 1. Create new exporter class: CustomMetricsExporter
// 2. Update factory: add case 'custom'
// 3. Done! No changes to Reporter or MetricsCollector
```

#### Best Practices
```typescript
// ✅ DO: Use factory for complex object creation
class MetricsCollector {
  constructor(factory: MetricsExporterFactory) {
    this.exporter = factory.createExporter(this.config);
  }
}

// ❌ DON'T: Hide factory creation with a static method (hard to test)
class MetricsExporterFactory {
  static getInstance(): MetricsExporter { // Can't inject test version!
    return new OTLPMetricsExporter();
  }
}

// ✅ DO: Create a factory for each major type
interface MetricsExporterFactory { }
interface FlakynessStrategyFactory { }
interface MetricsCollectorFactory { }

// ❌ DON'T: Create a mega-factory for everything
interface MegaFactory {
  createExporter();
  createStrategy();
  createCollector();
  // ... 50 more methods
}
```

---

### 3. Observer Pattern

#### What It Is
Objects (observers) subscribe to events from another object (subject). When the event happens, all observers are notified.

#### Why It Matters
- **Decoupling:** Subject doesn't know who's listening
- **Extensibility:** Add new observers without changing subject
- **Event-Driven:** Natural fit for test lifecycle (onTestEnd, onStepEnd)

#### Example: Without Observer (❌ BAD)

```typescript
// Reporter tightly coupled to specific listeners
class Reporter {
  constructor(
    private metricsCollector: MetricsCollector,
    private traceExporter: TraceExporter,
    private alertingService: AlertingService,
    private customAnalytics: CustomAnalytics,
    private userDefinedListeners: UserListener[], // What if there's a 5th one?
  ) {}
  
  async onTestEnd(test: TestCase, result: TestResult) {
    // Hard-coded calls to each listener - not scalable!
    await this.metricsCollector.onTestEnd(test, result);
    await this.traceExporter.onTestEnd(test, result);
    await this.alertingService.onTestEnd(test, result);
    await this.customAnalytics.onTestEnd(test, result);
    
    // What about the 5th listener? Add another parameter!
    for (const listener of this.userDefinedListeners) {
      await listener.onTestEnd(test, result);
    }
  }
}

// Problems:
// - Reporter has too many dependencies (hard to understand)
// - Adding a new listener requires changing Reporter code
// - Testing is complex (need to mock all listeners)
```

#### Example: With Observer (✅ GOOD)

```typescript
// Define the observer contract
interface TestEventListener {
  onTestEnd(test: TestCase, result: TestResult): Promise<void>;
  onTestBegin(test: TestCase): Promise<void>;
  onStepEnd(step: Step): Promise<void>;
  // ... other lifecycle methods
}

// Reporter accepts listeners via subscription
class Reporter {
  private listeners: TestEventListener[] = [];
  
  subscribe(listener: TestEventListener) {
    this.listeners.push(listener);
  }
  
  unsubscribe(listener: TestEventListener) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }
  
  async onTestEnd(test: TestCase, result: TestResult) {
    // Notify all subscribers - no hard-coded dependencies!
    await Promise.all(
      this.listeners.map(listener => listener.onTestEnd(test, result))
    );
  }
}

// Any team can subscribe their own listener
const reporter = new Reporter();

// Team A: Add metrics
reporter.subscribe(metricsCollector);

// Team B: Add alerting
reporter.subscribe(alertingService);

// Team C: Add custom analytics
reporter.subscribe(customAnalytics);

// Team D: Add their own thing
class CustomTeamListener implements TestEventListener {
  async onTestEnd(test: TestCase, result: TestResult) {
    // Custom logic here
    await this.sendToCustomBackend(test, result);
  }
  
  async onTestBegin(test: TestCase) {
    // Custom logic
  }
  
  async onStepEnd(step: Step) {
    // Custom logic
  }
}

reporter.subscribe(new CustomTeamListener());
// Done! No changes to Reporter code!
```

#### Best Practices
```typescript
// ✅ DO: Define clear listener interface
interface TestEventListener {
  onTestEnd(test: TestCase, result: TestResult): void;
}

// ✅ DO: Allow multiple subscriptions
reporter.subscribe(listener1);
reporter.subscribe(listener2);
reporter.subscribe(listener3);

// ✅ DO: Notify all listeners
listeners.forEach(l => l.onTestEnd(test, result));

// ❌ DON'T: Assume listeners implement all methods
// Instead, use optional methods or separate interfaces
interface TestEventListener {
  onTestEnd?(test, result); // optional
  onTestBegin?(test);       // optional
}

// ❌ DON'T: Stop on listener failure (notify all before throwing)
listeners.forEach(l => {
  try {
    l.onTestEnd(test, result);
  } catch (e) {
    console.error('Listener error:', e);
    // Continue notifying others
  }
});
```

---

### 4. Strategy Pattern

#### What It Is
Define a family of algorithms, encapsulate each one, and make them interchangeable. Choose the algorithm at runtime.

#### Why It Matters
- **Flexibility:** Choose algorithm based on configuration or data
- **No If-Else:** Replace conditionals with polymorphism
- **Testability:** Test each strategy independently

#### Example: Without Strategy (❌ BAD)

```typescript
// Flakiness detection with hardcoded if-else logic
class FlakynessDetector {
  constructor(private algorithm: 'simple' | 'weighted' | 'ml') {}
  
  detectFlakiness(testRuns: TestRun[]): FlakynessScore {
    if (this.algorithm === 'simple') {
      // Simple: fail rate = failures / total runs
      const failureRate = testRuns.filter(r => !r.passed).length / testRuns.length;
      return {
        confidence: failureRate > 0.3 ? 1.0 : 0.0,
        isFlaky: failureRate > 0.3,
        failureRate,
      };
    } else if (this.algorithm === 'weighted') {
      // Weighted: recent runs matter more
      const recentRuns = testRuns.slice(-5);
      const recentFailureRate = recentRuns.filter(r => !r.passed).length / recentRuns.length;
      const overallFailureRate = testRuns.filter(r => !r.passed).length / testRuns.length;
      
      const score = recentFailureRate * 0.7 + overallFailureRate * 0.3;
      return {
        confidence: score > 0.3 ? 1.0 : 0.0,
        isFlaky: score > 0.3,
        failureRate: score,
      };
    } else if (this.algorithm === 'ml') {
      // ML-based: use a trained model
      const prediction = this.mlModel.predict(testRuns);
      return {
        confidence: prediction.confidence,
        isFlaky: prediction.confidence > 0.5,
        failureRate: prediction.failureRate,
      };
    } else {
      throw new Error(`Unknown algorithm: ${this.algorithm}`);
    }
  }
}

// Problems:
// - Method is too long and hard to read
// - Hard to add a new algorithm (modify existing method)
// - Hard to test each algorithm independently
// - Easy to introduce bugs when modifying one algorithm
```

#### Example: With Strategy (✅ GOOD)

```typescript
// Strategy interface - each algorithm implements this
interface FlakynessStrategy {
  detect(testRuns: TestRun[]): FlakynessScore;
}

// Concrete strategies - each algorithm in its own class
class SimpleFlakynessStrategy implements FlakynessStrategy {
  detect(testRuns: TestRun[]): FlakynessScore {
    const failureRate = testRuns.filter(r => !r.passed).length / testRuns.length;
    return {
      confidence: failureRate > 0.3 ? 1.0 : 0.0,
      isFlaky: failureRate > 0.3,
      failureRate,
    };
  }
}

class WeightedFlakynessStrategy implements FlakynessStrategy {
  detect(testRuns: TestRun[]): FlakynessScore {
    const recentRuns = testRuns.slice(-5);
    const recentFailureRate = recentRuns.filter(r => !r.passed).length / recentRuns.length;
    const overallFailureRate = testRuns.filter(r => !r.passed).length / testRuns.length;
    
    const score = recentFailureRate * 0.7 + overallFailureRate * 0.3;
    return {
      confidence: score > 0.3 ? 1.0 : 0.0,
      isFlaky: score > 0.3,
      failureRate: score,
    };
  }
}

class MLFlakynessStrategy implements FlakynessStrategy {
  constructor(private model: FlakynessModel) {}
  
  detect(testRuns: TestRun[]): FlakynessScore {
    const prediction = this.model.predict(testRuns);
    return {
      confidence: prediction.confidence,
      isFlaky: prediction.confidence > 0.5,
      failureRate: prediction.failureRate,
    };
  }
}

// Context class - uses a strategy (via DI!)
class FlakynessDetector {
  constructor(private strategy: FlakynessStrategy) {}
  
  detectFlakiness(testRuns: TestRun[]): FlakynessScore {
    return this.strategy.detect(testRuns); // Delegates to strategy
  }
}

// Usage is clean and flexible
const simpleDetector = new FlakynessDetector(new SimpleFlakynessStrategy());
const weightedDetector = new FlakynessDetector(new WeightedFlakynessStrategy());
const mlDetector = new FlakynessDetector(new MLFlakynessStrategy(mlModel));

// To add a new algorithm:
// 1. Create new class: CustomFlakynessStrategy implements FlakynessStrategy
// 2. Pass it to FlakynessDetector
// 3. Done! No changes to existing code!
```

#### Best Practices
```typescript
// ✅ DO: Use Strategy for pluggable algorithms
class FlakynessDetector {
  constructor(private strategy: FlakynessStrategy) {}
}

// ✅ DO: Test each strategy independently
test('SimpleFlakynessStrategy', () => {
  const strategy = new SimpleFlakynessStrategy();
  const result = strategy.detect(mockRuns);
  expect(result.isFlaky).toBe(true);
});

// ❌ DON'T: Merge strategies into one class
class FlakynessDetector {
  detect(algorithm: string, runs: TestRun[]) {
    if (algorithm === 'simple') { ... }
    if (algorithm === 'weighted') { ... }
  }
}

// ❌ DON'T: Create strategies that are too specific
// Instead, make them general-purpose and configurable
```

---

### 5. Interface-Based Design (SOLID Principles)

#### What It Is
Define contracts (interfaces) before implementation. Depend on abstractions, not concrete classes.

#### Why It Matters
- **S**ingle Responsibility: Each class has one reason to change
- **O**pen/Closed: Open for extension, closed for modification
- **L**iskov Substitution: Derived classes don't break contracts
- **I**nterface Segregation: Clients don't depend on methods they don't use
- **D**ependency Inversion: Depend on abstractions, not concretions

#### Example: Without Interface-Based Design (❌ BAD)

```typescript
// Concrete classes everywhere - hard to extend or test
class OTLPMetricsCollector {
  recordTestEnd(test: TestCase, result: TestResult) {
    // OTLP-specific logic
  }
  
  export() {
    // OTLP export logic
  }
}

class PrometheusMetricsCollector {
  recordTestEnd(test: TestCase, result: TestResult) {
    // Prometheus-specific logic
  }
  
  export() {
    // Prometheus export logic
  }
}

// Reporter is tightly coupled to OTLPMetricsCollector
class Reporter {
  private collector = new OTLPMetricsCollector(); // Hard-coded!
  
  onTestEnd(test: TestCase, result: TestResult) {
    this.collector.recordTestEnd(test, result);
  }
}

// Problems:
// - Can't easily switch to PrometheusMetricsCollector
// - Can't test with a mock collector
// - Changing collector interface affects Reporter
```

#### Example: With Interface-Based Design (✅ GOOD)

```typescript
// Define contracts first (interfaces)
interface MetricsCollector {
  recordTestStart(test: TestCase): void;
  recordTestEnd(test: TestCase, result: TestResult): void;
  recordStepStart(step: Step): void;
  recordStepEnd(step: Step): void;
  shutdown(): Promise<void>;
}

interface MetricsExporter {
  export(metrics: Metrics): Promise<void>;
  isHealthy(): boolean;
}

// Concrete implementations follow the interface
class OTLPMetricsCollector implements MetricsCollector {
  recordTestEnd(test: TestCase, result: TestResult) {
    // OTLP-specific logic
  }
  
  // ... other methods
}

class PrometheusMetricsCollector implements MetricsCollector {
  recordTestEnd(test: TestCase, result: TestResult) {
    // Prometheus-specific logic
  }
  
  // ... other methods
}

// Reporter depends on interface, not concrete class
class Reporter {
  constructor(private collector: MetricsCollector) {
    // Accepts any collector implementing the interface
  }
  
  onTestEnd(test: TestCase, result: TestResult) {
    this.collector.recordTestEnd(test, result);
  }
}

// Usage is flexible
const reporter1 = new Reporter(new OTLPMetricsCollector());
const reporter2 = new Reporter(new PrometheusMetricsCollector());

// For testing
const mockCollector: MetricsCollector = {
  recordTestStart: jest.fn(),
  recordTestEnd: jest.fn(),
  recordStepStart: jest.fn(),
  recordStepEnd: jest.fn(),
  shutdown: jest.fn(),
};
const reporter = new Reporter(mockCollector);
```

#### Best Practices
```typescript
// ✅ DO: Segregate interfaces (interface segregation principle)
interface MetricsCollector {
  recordTestEnd(test: TestCase, result: TestResult): void;
  recordStepEnd(step: Step): void;
}

interface MetricsExporter {
  export(metrics: Metrics): Promise<void>;
}

// ❌ DON'T: Create fat interfaces
interface MetricsService {
  recordTestEnd(test, result): void;
  recordStepEnd(step): void;
  export(metrics): Promise<void>;
  analyze(metrics): Analysis; // Doesn't belong here!
  alert(metrics): void;        // Doesn't belong here!
}

// ✅ DO: Depend on abstractions
class Reporter {
  constructor(private collector: MetricsCollector) {}
}

// ❌ DON'T: Depend on concrete classes
class Reporter {
  constructor(private collector: OTLPMetricsCollector) {}
}
```

---

## SOLID Principles

### S - Single Responsibility Principle (SRP)
Each class should have only one reason to change.

```typescript
// ✅ GOOD - Each class has one job
class MetricsRecorder {
  recordDuration(name: string, duration: number) { /* ... */ }
  recordCounter(name: string, value: number) { /* ... */ }
}

class MetricsExporter {
  export(metrics: Metrics): Promise<void> { /* ... */ }
  isHealthy(): boolean { /* ... */ }
}

class FlakynessDetector {
  detectFlakiness(runs: TestRun[]): FlakynessScore { /* ... */ }
}

// ❌ BAD - MetricsManager has multiple responsibilities
class MetricsManager {
  recordDuration() { /* ... */ }
  recordCounter() { /* ... */ }
  export() { /* ... */ }
  detectFlakiness() { /* ... */ }
  sendAlerts() { /* ... */ }
  // Too many reasons to change!
}
```

### O - Open/Closed Principle (OCP)
Open for extension, closed for modification.

```typescript
// ✅ GOOD - Extend by adding new strategies, not modifying existing code
interface FlakynessStrategy { detect(runs: TestRun[]): FlakynessScore; }
class SimpleFlakynessStrategy implements FlakynessStrategy { /* ... */ }
class WeightedFlakynessStrategy implements FlakynessStrategy { /* ... */ }
class CustomFlakynessStrategy implements FlakynessStrategy { /* ... */ } // NEW, no changes to existing code

// ❌ BAD - Closed to extension, requires modifying existing code
if (algorithm === 'simple') { /* ... */ }
else if (algorithm === 'weighted') { /* ... */ }
// Add new algorithm: modify this file!
```

### L - Liskov Substitution Principle (LSP)
Derived classes must be substitutable for base classes.

```typescript
// ✅ GOOD - All collectors implement the interface correctly
interface MetricsCollector {
  recordTestEnd(test: TestCase, result: TestResult): void;
}

class OTLPMetricsCollector implements MetricsCollector {
  recordTestEnd(test: TestCase, result: TestResult) {
    // Behaves as expected
  }
}

class PrometheusMetricsCollector implements MetricsCollector {
  recordTestEnd(test: TestCase, result: TestResult) {
    // Behaves consistently - can be swapped with OTLPMetricsCollector
  }
}

// ❌ BAD - Violates substitution
class BrokenMetricsCollector implements MetricsCollector {
  recordTestEnd(test: TestCase, result: TestResult) {
    // Ignores result parameter (breaks contract!)
    // Or throws unexpected exception (breaks expectation!)
  }
}
```

### I - Interface Segregation Principle (ISP)
Don't force classes to implement methods they don't need.

```typescript
// ✅ GOOD - Segregated interfaces
interface MetricsExporter {
  export(metrics: Metrics): Promise<void>;
}

interface MetricsAnalyzer {
  analyze(metrics: Metrics): Analysis;
}

class OTLPMetricsExporter implements MetricsExporter {
  export(metrics: Metrics) { /* ... */ }
  // Doesn't implement MetricsAnalyzer - doesn't need to
}

// ❌ BAD - Fat interface
interface MetricsService {
  export(metrics): Promise<void>;
  analyze(metrics): Analysis;
}

class OTLPMetricsExporter implements MetricsService {
  export(metrics) { /* ... */ }
  analyze(metrics) { // I don't need this, but I have to implement it! }
}
```

### D - Dependency Inversion Principle (DIP)
Depend on abstractions, not concrete implementations.

```typescript
// ✅ GOOD - Depends on abstraction (MetricsCollector interface)
class Reporter {
  constructor(private collector: MetricsCollector) {} // Interface
}

// ❌ BAD - Depends on concrete class
class Reporter {
  constructor(private collector: OTLPMetricsCollector) {} // Concrete
}
```

---

## Real-World Examples

### Example 1: Adding a New Metrics Backend

**Scenario:** Your team wants to export metrics to DatadogMetricsExporter instead of OTLP.

**With Design Patterns:**
```typescript
// Step 1: Create new exporter (implements interface)
class DatadogMetricsExporter implements MetricsExporter {
  async export(metrics: Metrics): Promise<void> {
    // Datadog-specific export logic
  }
}

// Step 2: Update factory
class MetricsExporterFactory {
  createExporter(config: Config): MetricsExporter {
    if (config.backend === 'datadog') {
      return new DatadogMetricsExporter(config.ddApiKey);
    }
    // ... other cases
  }
}

// Step 3: Done! No changes to Reporter or MetricsCollector
const exporter = factory.createExporter({ backend: 'datadog', ddApiKey: '...' });
```

### Example 2: Adding Custom Flakiness Detection

**Scenario:** Your team has an ML model for detecting flaky tests.

**With Design Patterns:**
```typescript
// Step 1: Create new strategy (implements interface)
class CustomMLFlakynessStrategy implements FlakynessStrategy {
  constructor(private model: MLModel) {}
  
  detect(testRuns: TestRun[]): FlakynessScore {
    // ML-based detection
    return this.model.predictFlakiness(testRuns);
  }
}

// Step 2: Use the strategy (DI)
const detector = new FlakynessDetector(new CustomMLFlakynessStrategy(mlModel));

// Step 3: Done! No changes to MetricsCollector
```

### Example 3: Adding Custom Listener

**Scenario:** Your team wants to send alerts on test failures.

**With Design Patterns:**
```typescript
// Step 1: Create listener (implements interface)
class AlertingListener implements TestEventListener {
  async onTestEnd(test: TestCase, result: TestResult) {
    if (!result.passed) {
      await this.sendAlert(`Test ${test.title} failed`);
    }
  }
  
  async onTestBegin(test: TestCase) { /* ... */ }
  async onStepEnd(step: Step) { /* ... */ }
}

// Step 2: Subscribe to reporter
reporter.subscribe(new AlertingListener());

// Step 3: Done! No changes to Reporter
```

---

## When to Use Each Pattern

| Pattern | Use When | Example |
|---------|----------|---------|
| **Dependency Injection** | Always for important dependencies | Pass MetricsExporter to collector |
| **Factory** | Creating objects based on configuration | Create right exporter based on config |
| **Observer** | Event-driven architecture | Listen to test lifecycle events |
| **Strategy** | Multiple pluggable algorithms | Simple vs weighted flakiness detection |
| **Interface-Based** | Always; define interfaces first | MetricsCollector interface |

---

## Common Mistakes

### Mistake 1: Using Dependency Injection Everywhere (Even Strings)
```typescript
// ❌ Over-engineered
class Reporter {
  constructor(
    private testName: string, // Why inject a string?
    private collector: MetricsCollector
  ) {}
}

// ✅ Better - inject dependencies, not data
class Reporter {
  constructor(private collector: MetricsCollector) {}
  
  onTestEnd(test: TestCase) {
    this.collector.recordTestEnd(test);
  }
}
```

### Mistake 2: Creating Circular Dependencies
```typescript
// ❌ Circular dependency (A depends on B, B depends on A)
class MetricsCollector {
  constructor(private reporter: Reporter) {}
}

class Reporter {
  constructor(private collector: MetricsCollector) {}
}

// ✅ Break the cycle with an event emitter
class EventBus {
  on(event: string, listener: Function) {}
  emit(event: string, data: any) {}
}

class MetricsCollector {
  constructor(private bus: EventBus) {
    this.bus.on('testEnd', this.onTestEnd);
  }
}

class Reporter {
  constructor(private bus: EventBus) {}
  
  onTestEnd(test: TestCase) {
    this.bus.emit('testEnd', test);
  }
}
```

### Mistake 3: Factory Returns Different Types (Violates LSP)
```typescript
// ❌ Factory returns different interfaces
class MetricsFactory {
  createCollector(config: Config) {
    if (config.type === 'otlp') {
      return new OTLPMetricsCollector(); // Returns MetricsCollector
    } else {
      return new WeirdMetricsService(); // Returns something else!
    }
  }
}

// ✅ All implementations follow the same interface
interface MetricsCollector {
  recordTestEnd(test: TestCase, result: TestResult): void;
}

class MetricsFactory {
  createCollector(config: Config): MetricsCollector {
    // Always returns MetricsCollector
  }
}
```

### Mistake 4: Observer Pattern Without Error Handling
```typescript
// ❌ One listener fails, others don't get notified
listeners.forEach(l => l.onTestEnd(test, result)); // If l1 throws, l2 never runs!

// ✅ Notify all listeners even if some fail
const errors: Error[] = [];
listeners.forEach(l => {
  try {
    l.onTestEnd(test, result);
  } catch (e) {
    errors.push(e);
  }
});

if (errors.length > 0) {
  console.error('Some listeners failed:', errors);
}
```

---

## Summary

- **DI:** Inject dependencies at constructor time
- **Factory:** Centralize object creation; make it configuration-driven
- **Observer:** Decouple event publishers from listeners
- **Strategy:** Plug in different algorithms; no if-else
- **Interface-Based:** Define contracts first; depend on abstractions

These patterns make your code:
- ✅ **Testable** (easy to mock)
- ✅ **Extensible** (easy to add new features)
- ✅ **Maintainable** (clear responsibilities)
- ✅ **Scalable** (handles complexity)

---

## References

- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Refactoring.Guru Design Patterns](https://refactoring.guru/design-patterns)
- [Google TypeScript Guide](https://google.github.io/styleguide/tsguide.html)
- [OpenTelemetry Best Practices](https://opentelemetry.io/docs/concepts/optel-best-practices/)
