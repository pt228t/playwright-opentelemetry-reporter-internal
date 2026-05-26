# Test-Driven Development (TDD) Strategy
## Playwright OpenTelemetry Reporter - Metrics Implementation

**Purpose:** This document explains how we'll use TDD to build the metrics system with confidence.

**Target Audience:** All developers implementing the metrics features.

---

## What is TDD?

TDD is a simple 3-step cycle:

```
1. RED:     Write failing test (test what doesn't exist yet)
2. GREEN:   Write minimal code to make test pass
3. REFACTOR: Improve code without changing behavior
4. REPEAT:  Next feature
```

**Why TDD for Metrics?**
- **Prevents Bugs:** Tests catch breaking changes before deployment
- **Clarifies Design:** Writing tests forces us to think about interfaces
- **Documents Behavior:** Tests serve as living documentation
- **Enables Refactoring:** Refactor safely; tests prevent regressions
- **Ensures Testability:** Code written with tests in mind is naturally loosely coupled

---

## TDD Workflow for This Project

### Phase 1: Interfaces & Tests (Week 1-2)

**Step 1: Write Failing Tests (RED)**

Create test file: `test/unit/metrics/collector.test.ts`

```typescript
import { MetricsCollector } from '../../../src/lib/metrics/collector';

describe('MetricsCollector', () => {
  // Test 1: Should initialize without errors
  it('should initialize with injected exporter', () => {
    const mockExporter = { send: jest.fn() };
    const collector = new MetricsCollector(mockExporter);
    expect(collector).toBeDefined();
  });

  // Test 2: Should record test start
  it('should record test start with attributes', () => {
    const mockExporter = { send: jest.fn() };
    const collector = new MetricsCollector(mockExporter);
    
    const testCase = { id: 'test-1', title: 'example test' };
    collector.recordTestStart(testCase);
    
    // Verify exporter was called
    expect(mockExporter.send).toHaveBeenCalled();
  });

  // Test 3: Should record test end with duration
  it('should record test end with duration', () => {
    const mockExporter = { send: jest.fn() };
    const collector = new MetricsCollector(mockExporter);
    
    const testCase = { id: 'test-1', title: 'example test' };
    const result = { passed: true, duration: 150 };
    
    collector.recordTestStart(testCase);
    collector.recordTestEnd(testCase, result);
    
    // Verify exporter was called with metrics
    expect(mockExporter.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'test.duration',
        value: 150,
        attributes: expect.objectContaining({
          'test.case.name': 'example test',
          'test.result.status': 'passed',
        }),
      })
    );
  });
});
```

**Run tests:** `npm test -- test/unit/metrics/collector.test.ts`

**Result:** ❌ All tests FAIL (expected - files don't exist yet)

---

**Step 2: Write Minimal Interface Code (GREEN)**

Create file: `src/lib/metrics/types.ts`

```typescript
/**
 * DESIGN DECISION: Why interfaces?
 * - Define contracts before implementation
 * - Allow multiple implementations (OTLP, Prometheus, custom)
 * - Make testing easy (inject mocks)
 * See: design-strategy/DESIGN_PATTERNS.md#interface-based-design
 */

export interface Metric {
  name: string;
  value: number;
  attributes?: Record<string, string | number>;
  timestamp?: number;
}

export interface MetricsExporter {
  send(metric: Metric): Promise<void>;
}

export interface TestCase {
  id: string;
  title: string;
}

export interface TestResult {
  passed: boolean;
  duration: number;
}
```

Create file: `src/lib/metrics/collector.ts`

```typescript
import { MetricsCollector as IMetricsCollector } from './types';
import type { MetricsExporter, TestCase, TestResult, Metric } from './types';

/**
 * DESIGN DECISION: Using Dependency Injection
 * - Pass exporter at construction time (loose coupling)
 * - Allows easy testing with mock exporters
 * - Different teams can provide different exporters
 * See: design-strategy/DESIGN_PATTERNS.md#dependency-injection
 */
export class MetricsCollector implements IMetricsCollector {
  private startTimes: Map<string, number> = new Map();

  constructor(private exporter: MetricsExporter) {}

  /**
   * TODO: [PHASE 2] Integrate with flakiness detector
   * Related issue: #XXXX
   */
  recordTestStart(test: TestCase): void {
    this.startTimes.set(test.id, Date.now());
  }

  recordTestEnd(test: TestCase, result: TestResult): void {
    const startTime = this.startTimes.get(test.id) || Date.now();
    const duration = result.duration || (Date.now() - startTime);

    const metric: Metric = {
      name: 'test.duration',
      value: duration,
      attributes: {
        'test.case.name': test.title,
        'test.result.status': result.passed ? 'passed' : 'failed',
      },
    };

    this.exporter.send(metric);
    this.startTimes.delete(test.id);
  }

  recordStepStart(step: any): void {
    // TODO: [PHASE 2] Implement step tracking
  }

  recordStepEnd(step: any): void {
    // TODO: [PHASE 2] Implement step tracking
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
```

**Run tests:** `npm test -- test/unit/metrics/collector.test.ts`

**Result:** ✅ Tests PASS

---

**Step 3: Review & Refactor (REFACTOR)**

Code is already clean and minimal. No refactoring needed yet.

---

### Phase 2: Core Implementation (Weeks 3-4)

**Step 1: Write More Tests (RED)**

Add to `test/unit/metrics/collector.test.ts`:

```typescript
// Test 4: Should track multiple tests independently
it('should track multiple tests independently', () => {
  const mockExporter = { send: jest.fn() };
  const collector = new MetricsCollector(mockExporter);
  
  const test1 = { id: 'test-1', title: 'test 1' };
  const test2 = { id: 'test-2', title: 'test 2' };
  
  collector.recordTestStart(test1);
  collector.recordTestStart(test2);
  
  collector.recordTestEnd(test1, { passed: true, duration: 100 });
  collector.recordTestEnd(test2, { passed: false, duration: 200 });
  
  expect(mockExporter.send).toHaveBeenCalledTimes(2);
  expect(mockExporter.send).toHaveBeenNthCalledWith(1,
    expect.objectContaining({ value: 100 })
  );
  expect(mockExporter.send).toHaveBeenNthCalledWith(2,
    expect.objectContaining({ value: 200 })
  );
});

// Test 5: Should calculate percentiles
it('should calculate duration percentiles', () => {
  const mockExporter = { send: jest.fn() };
  const collector = new MetricsCollector(mockExporter);
  
  // Record 10 tests with different durations
  for (let i = 0; i < 10; i++) {
    const test = { id: `test-${i}`, title: `test ${i}` };
    collector.recordTestStart(test);
    collector.recordTestEnd(test, { passed: true, duration: (i + 1) * 10 });
  }
  
  const metrics = collector.getMetrics();
  expect(metrics.testDurationPercentiles).toBeDefined();
  expect(metrics.testDurationPercentiles.p50).toBeLessThan(
    metrics.testDurationPercentiles.p99
  );
});
```

**Run tests:** `npm test -- test/unit/metrics/collector.test.ts`

**Result:** ❌ New tests FAIL

---

**Step 2: Implement Features (GREEN)**

Update `src/lib/metrics/collector.ts`:

```typescript
export class MetricsCollector implements IMetricsCollector {
  private startTimes: Map<string, number> = new Map();
  private durations: number[] = [];

  constructor(private exporter: MetricsExporter) {}

  recordTestStart(test: TestCase): void {
    this.startTimes.set(test.id, Date.now());
  }

  recordTestEnd(test: TestCase, result: TestResult): void {
    const startTime = this.startTimes.get(test.id) || Date.now();
    const duration = result.duration || (Date.now() - startTime);

    this.durations.push(duration);

    const metric: Metric = {
      name: 'test.duration',
      value: duration,
      attributes: {
        'test.case.name': test.title,
        'test.result.status': result.passed ? 'passed' : 'failed',
      },
    };

    this.exporter.send(metric);
    this.startTimes.delete(test.id);
  }

  getMetrics() {
    const sorted = [...this.durations].sort((a, b) => a - b);
    return {
      testDurationPercentiles: {
        p50: this.percentile(sorted, 0.5),
        p95: this.percentile(sorted, 0.95),
        p99: this.percentile(sorted, 0.99),
      },
    };
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  // ... other methods
}
```

**Run tests:** `npm test -- test/unit/metrics/collector.test.ts`

**Result:** ✅ All tests PASS

---

**Step 3: Refactor (REFACTOR)**

Extract utility function:

```typescript
// Create: src/lib/metrics/utils/percentile.ts
export function calculatePercentile(values: number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * percentile) - 1;
  return sorted[Math.max(0, index)];
}

// Update: src/lib/metrics/collector.ts
import { calculatePercentile } from './utils/percentile';

// In getMetrics():
testDurationPercentiles: {
  p50: calculatePercentile(this.durations, 0.5),
  p95: calculatePercentile(this.durations, 0.95),
  p99: calculatePercentile(this.durations, 0.99),
}
```

---

### Test Categories

#### 1. **Unit Tests** (Fast, Isolated)
- Test one class in isolation
- Mock external dependencies (exporter, database)
- Location: `test/unit/metrics/*.test.ts`

**Example:**
```typescript
test('MetricsCollector records test end', () => {
  const mockExporter = { send: jest.fn() };
  const collector = new MetricsCollector(mockExporter);
  
  collector.recordTestEnd({ id: '1', title: 'test' }, { passed: true, duration: 100 });
  
  expect(mockExporter.send).toHaveBeenCalled();
});
```

**Speed:** ~10ms per test

#### 2. **Integration Tests** (Medium Speed, Real Components)
- Test multiple components together
- Use mock SDK exporter (no real backend)
- Location: `test/integration/*.test.ts`

**Example:**
```typescript
test('Reporter + MetricsCollector work together', async () => {
  const mockExporter = new MockOTLPExporter();
  const sdk = new NodeSDK({ /* ... */ });
  const reporter = new Reporter();
  const metricsCollector = new MetricsCollector(mockExporter);
  
  reporter.subscribe(metricsCollector);
  
  await reporter.onTestEnd(mockTest, mockResult);
  
  const exported = mockExporter.getExportedMetrics();
  expect(exported).toContainMetric('test.duration');
});
```

**Speed:** ~100-200ms per test

#### 3. **End-to-End Tests** (Slow, Real Setup)
- Actual Playwright test runs
- Real (or docker) OTLP backend
- Location: `test/e2e/*.test.ts`

**Example:**
```typescript
test('metrics generated from actual Playwright test', async ({ page }) => {
  await page.goto('https://example.com');
  await page.click('button');
  expect(page.url()).toContain('result');
});

// Then verify metrics in OTLP backend via post-test hook
afterEach(async () => {
  const metrics = await otlpBackend.getMetrics();
  expect(metrics).toContainMetric('test.duration');
});
```

**Speed:** ~1-5 seconds per test

---

## Best Practices for TDD in This Project

### 1. **Write Tests Before Implementation**
```
❌ BAD:  Code → Test → Hope it works
✅ GOOD: Test → Code → Verify all tests pass
```

### 2. **Test Behavior, Not Implementation**
```typescript
// ❌ BAD - Tests implementation details
test('should use Map internally', () => {
  const collector = new MetricsCollector(mockExporter);
  expect(collector['durations']).toBeInstanceOf(Map);
});

// ✅ GOOD - Tests behavior
test('should record multiple test durations', () => {
  const collector = new MetricsCollector(mockExporter);
  collector.recordTestEnd(test1, { passed: true, duration: 100 });
  collector.recordTestEnd(test2, { passed: true, duration: 200 });
  
  const metrics = collector.getMetrics();
  expect(metrics.testCount).toBe(2);
});
```

### 3. **Use Descriptive Test Names**
```typescript
// ❌ BAD
test('test1', () => { });
test('works', () => { });

// ✅ GOOD
test('should record test end with duration and status', () => { });
test('should calculate percentiles across 100+ tests', () => { });
```

### 4. **Test Edge Cases**
```typescript
test('should handle empty durations array', () => {
  const collector = new MetricsCollector(mockExporter);
  const metrics = collector.getMetrics();
  
  expect(metrics.testDurationPercentiles.p50).toBe(0);
});

test('should handle single test duration', () => {
  const collector = new MetricsCollector(mockExporter);
  collector.recordTestEnd({ id: '1', title: 'test' }, { passed: true, duration: 100 });
  
  const metrics = collector.getMetrics();
  expect(metrics.testDurationPercentiles.p50).toBe(100);
});
```

### 5. **Mock External Dependencies**
```typescript
// ✅ DO: Mock the exporter
const mockExporter: MetricsExporter = {
  send: jest.fn().mockResolvedValue(undefined),
};

// ❌ DON'T: Use real exporter in unit tests
const realExporter = new OTLPMetricsExporter({ /* ... */ });
```

---

## Test Coverage Goals

By phase:

| Phase | Coverage Goal | What to Test |
|-------|---------------|--------------|
| Phase 1 | 100% | Interfaces + basic initialization |
| Phase 2 | 95%+ | Core collector, recording, percentiles |
| Phase 3 | 90%+ | Flakiness strategies, edge cases |
| Phase 4 | 85%+ | Exporter integration (some external deps) |
| Phase 5 | 90%+ | Reporter integration, event flow |
| Phase 8 | 90%+ | E2E tests added, final coverage check |

**Run coverage:**
```bash
npm test -- --coverage
npm run coverage:report  # Generate HTML report
```

---

## Common TDD Mistakes

### Mistake 1: Testing Too Much Implementation Detail
```typescript
// ❌ BAD - Brittle test, breaks on refactor
test('should use Map for storage', () => {
  expect(collector['durations']).toBeInstanceOf(Map);
});

// ✅ GOOD - Flexible test
test('should track multiple test durations', () => {
  collector.recordTestEnd(test1, { duration: 100 });
  expect(collector.getMetrics().totalTests).toBe(1);
});
```

### Mistake 2: Forgetting to Test Error Cases
```typescript
// ❌ BAD - Only happy path
test('should record metric', () => {
  collector.recordTestEnd(test, { passed: true, duration: 100 });
  expect(mockExporter.send).toHaveBeenCalled();
});

// ✅ GOOD - Both happy and error paths
test('should handle exporter failure gracefully', async () => {
  mockExporter.send.mockRejectedValue(new Error('Network error'));
  
  await expect(collector.recordTestEnd(test, { duration: 100 })).rejects.toThrow();
});
```

### Mistake 3: Writing Tests That Are Hard to Debug
```typescript
// ❌ BAD - Hard to debug
test('system works', () => {
  // 50 lines of setup
  // Assertion buried at the end
  expect(complexObject).toBe(expectedObject);
});

// ✅ GOOD - Clear, focused, debuggable
test('should calculate p95 percentile correctly', () => {
  const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const result = calculatePercentile(durations, 0.95);
  expect(result).toBe(95);
});
```

---

## TDD Workflow Checklist

For each feature:

- [ ] **1. Write Failing Test (RED)**
  - [ ] Create test file (or add to existing)
  - [ ] Write test(s) describing expected behavior
  - [ ] Run `npm test` - verify tests FAIL
  - [ ] Commit with message: "test: add [feature] tests"

- [ ] **2. Write Minimal Code (GREEN)**
  - [ ] Create minimal implementation to pass tests
  - [ ] Run `npm test` - verify tests PASS
  - [ ] Run `npm run lint` - fix any style issues
  - [ ] Commit with message: "feat: implement [feature]"

- [ ] **3. Refactor (REFACTOR)**
  - [ ] Extract utilities, constants
  - [ ] Improve readability without changing behavior
  - [ ] Run `npm test` - verify tests still PASS
  - [ ] Commit with message: "refactor: improve [feature]"

- [ ] **4. Review & Integrate**
  - [ ] Run full test suite: `npm test`
  - [ ] Run coverage: `npm test -- --coverage`
  - [ ] Peer review code
  - [ ] Merge to main branch

---

## Useful Testing Commands

```bash
# Run all tests
npm test

# Run specific test file
npm test -- test/unit/metrics/collector.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="percentile"

# Run with coverage
npm test -- --coverage

# Run in watch mode (re-run on file change)
npm test -- --watch

# Run with verbose output (see all test names)
npm test -- --verbose
```

---

## Summary

TDD for metrics:

1. ✅ **Write Tests First** - Clarifies requirements before coding
2. ✅ **Test Behavior** - Not implementation details
3. ✅ **Keep Tests Fast** - Unit tests < 100ms
4. ✅ **Use Mocks** - No real backends in unit tests
5. ✅ **Test Edge Cases** - Empty, single, many items
6. ✅ **Refactor Safely** - Tests prevent regressions

**Result:** High-quality, maintainable, reusable metrics system! 🎉
