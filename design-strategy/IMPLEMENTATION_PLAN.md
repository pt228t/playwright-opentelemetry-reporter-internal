# Implementation Plan
## Metrics Auto-Instrumentation for Playwright OpenTelemetry Reporter

**Project:** Add reusable, auto-instrumented metrics to playwright-opentelemetry-reporter
**Status:** Ready for Phase 1
**Target Timeline:** 10 weeks
**Approach:** Test-Driven Development (TDD) + Design Patterns

---

## Executive Summary (TL;DR)

We're adding **auto-instrumented metrics** to the existing trace system. Teams will get:
- ✅ Test execution time (p50, p95, p99)
- ✅ Step duration tracking
- ✅ Retry count & recovery metrics
- ✅ Flakiness confidence score (0-1)
- ✅ Pass/fail/flaky/skip counts

**Reusability:** Same NPM package model as traces. Configure in `playwright.config.ts`.
**Export:** Same OTLP backend as traces (unified observability).
**Patterns:** DI, Factory, Observer, Strategy, Interface-based (SOLID).

---

## Phase Breakdown

### PHASE 1: Architecture & Test Foundation (Weeks 1-2)
**Goal:** Define contracts and write tests BEFORE implementation

**Tasks:**

1. **Create documentation files** ✅
   - `design-strategy/DESIGN_PATTERNS.md` (✅ Created)
   - `design-strategy/TDD_STRATEGY.md` (✅ Created)
   - `design-strategy/METRICS_ARCHITECTURE.md` (✅ Created)
   - `design-strategy/IMPLEMENTATION_PLAN.md` (This file)

2. **Create interface definitions** (NEW)
   - [ ] Create `src/lib/metrics/types.ts` with all interfaces
     - `MetricsCollector`
     - `MetricRecorder`
     - `MetricsExporter`
     - `FlakynessStrategy`
     - `MetricsConfig`
     - Data types (`Metric`, `TestCase`, `TestResult`, `RunMetrics`, etc.)

3. **Create test files (TDD RED phase)** (NEW)
   - [ ] Create `test/unit/metrics/collector.test.ts` - Tests for MetricsCollector
   - [ ] Create `test/unit/metrics/recorder.test.ts` - Tests for MetricRecorder
   - [ ] Create `test/unit/metrics/exporter.test.ts` - Tests for exporters
   - [ ] Run `npm test` - All tests FAIL (expected in TDD RED phase)

4. **Setup testing utilities** (NEW)
   - [ ] Create `test/unit/metrics/fixtures.ts` - Mock data, test factories
   - [ ] Create `test/unit/metrics/mock-exporter.ts` - Mock MetricsExporter for tests
   - [ ] Add Jest setup in `jest.config.ts` (if needed)

5. **Peer review architecture** (NEW)
   - [ ] Code review interfaces with team
   - [ ] Validate design patterns approach
   - [ ] Approve test strategy

**Deliverable:** Interfaces defined, tests written (failing), documentation complete.

**Commits:**
```
feat: add metrics interfaces and types
test: add metrics unit tests (TDD RED phase)
docs: add design patterns and TDD strategy guides
```

---

### PHASE 2: Core MetricsCollector Implementation (Weeks 3-4)
**Goal:** Implement metrics recording engine

**Tasks:**

1. **Implement MetricsCollector class** (NEW)
   - [ ] Create `src/lib/metrics/collector.ts`
   - [ ] Implement `recordTestStart()` - Track test start time
   - [ ] Implement `recordTestEnd()` - Calculate duration, export metrics
   - [ ] Implement `recordStepStart()` / `recordStepEnd()` - Track steps
   - [ ] Implement `getMetrics()` - Return aggregated metrics
   - [ ] Add DI: receive `MetricsExporter` in constructor
   - [ ] Add comments linking to DESIGN_PATTERNS.md
   - [ ] Write additional tests: `npm test` - All tests PASS

2. **Implement MetricRecorder class** (NEW)
   - [ ] Create `src/lib/metrics/recorder.ts`
   - [ ] Implement `recordDuration()` - Histogram metric
   - [ ] Implement `recordCounter()` - Counter metric
   - [ ] Implement `recordGauge()` - Gauge metric
   - [ ] Integrate with MetricsCollector

3. **Create utility functions** (NEW)
   - [ ] Create `src/lib/metrics/utils/timing.ts`
     - Duration calculation utilities
     - Time tracking helpers
   - [ ] Create `src/lib/metrics/utils/attributes.ts`
     - Standard attribute builders
     - Common attribute constants
   - [ ] Create `src/lib/metrics/utils/percentile.ts`
     - Percentile (p50, p95, p99) calculation
     - Add tests: `test/unit/metrics/utils.test.ts`

4. **Run full test suite** (VERIFY)
   - [ ] `npm test -- test/unit/metrics/` - All tests PASS
   - [ ] `npm test -- --coverage` - Aim for 100% coverage
   - [ ] `npm run lint` - No lint errors
   - [ ] `npm run type-check` - No TypeScript errors

5. **Code review & integration** (REVIEW)
   - [ ] Peer review implementation
   - [ ] Verify DI and design patterns correctly applied
   - [ ] Merge to main branch

**Deliverable:** Core metrics collection working, 100% test coverage.

**Commits:**
```
feat: implement MetricsCollector class
feat: implement MetricRecorder class
feat: add timing and utility functions
test: add comprehensive unit tests for metrics
refactor: extract utility functions for reusability
```

---

### PHASE 3: Flakiness Detection (Week 5)
**Goal:** Detect flaky tests using pluggable strategies

**Tasks:**

1. **Define FlakynessStrategy interface** (NEW)
   - [ ] Create `src/lib/metrics/flakiness/strategy.ts`
   - [ ] Define `FlakynessStrategy` interface
   - [ ] Define `FlakynessScore` data type
   - [ ] Add comments: "See DESIGN_PATTERNS.md#strategy-pattern"

2. **Implement SimpleFlakynessStrategy** (NEW)
   - [ ] Create `src/lib/metrics/flakiness/simple.ts`
   - [ ] Logic: `failureRate > threshold` (e.g., 30%)
   - [ ] Pros: Fast, simple; Cons: Doesn't account for recency
   - [ ] Add tests: `test/unit/metrics/flakiness.test.ts`

3. **Implement WeightedFlakynessStrategy** (NEW)
   - [ ] Create `src/lib/metrics/flakiness/weighted.ts`
   - [ ] Logic: `(recentFailureRate * 0.7) + (overallFailureRate * 0.3)`
   - [ ] Pros: Accounts for recent behavior
   - [ ] Add tests

4. **Create FlakynessDetector context class** (NEW)
   - [ ] Create `src/lib/metrics/flakiness/detector.ts`
   - [ ] Accepts strategy via DI
   - [ ] Analyzes test runs and returns FlakynessScore
   - [ ] Add tests

5. **Integrate with MetricsCollector** (UPDATE)
   - [ ] Update `src/lib/metrics/collector.ts`
   - [ ] Inject FlakynessStrategy at construction
   - [ ] Call detector in `recordTestEnd()`
   - [ ] Include flakiness score in metrics
   - [ ] Update tests

6. **Add strategy factory** (NEW)
   - [ ] Create `src/lib/metrics/flakiness/factory.ts`
   - [ ] Factory chooses strategy based on config
   - [ ] Allows easy addition of new strategies

7. **Run full test suite** (VERIFY)
   - [ ] `npm test -- test/unit/metrics/` - All tests PASS
   - [ ] `npm test -- --coverage` - 90%+ coverage
   - [ ] No lint or type errors

**Deliverable:** Flaky tests detected with confidence score.

**Commits:**
```
feat: add flakiness detection strategies
feat: implement SimpleFlakynessStrategy
feat: implement WeightedFlakynessStrategy
feat: add FlakynessDetector
test: comprehensive tests for flakiness detection
```

---

### PHASE 4: Exporter Integration (Week 6)
**Goal:** Export metrics to OTLP backend

**Tasks:**

1. **Create MetricsExporterFactory** (NEW)
   - [ ] Create `src/lib/metrics/exporters/factory.ts`
   - [ ] Implements Factory pattern
   - [ ] Chooses exporter based on config
   - [ ] Supports: OTLP, Prometheus, custom

2. **Implement OTLPMetricsExporter** (NEW)
   - [ ] Create `src/lib/metrics/exporters/otlp.ts`
   - [ ] Converts metrics to OTLP format
   - [ ] Sends to OTLP collector
   - [ ] Integrates with OpenTelemetry SDK
   - [ ] Add tests with mock OTLP backend

3. **Update global-setup.ts** (UPDATE)
   - [ ] Add metrics exporter initialization
   - [ ] Create Meter from SDK
   - [ ] Export Meter for reporter to use
   - [ ] Verify both traces and metrics initialized

4. **Create PrometheusMetricsExporter template** (NEW - OPTIONAL)
   - [ ] Create `src/lib/metrics/exporters/prometheus.ts.template`
   - [ ] Template for teams to implement Prometheus support
   - [ ] Comments: "Copy and modify for your needs"

5. **Integration testing** (TEST)
   - [ ] Create `test/integration/exporter.test.ts`
   - [ ] Mock OTLP backend
   - [ ] Verify metrics exported correctly
   - [ ] Verify format matches OTEL spec

6. **Run full test suite** (VERIFY)
   - [ ] `npm test` - All tests PASS
   - [ ] Integration tests verify export flow
   - [ ] No lint or type errors

**Deliverable:** Metrics exported to OTLP backend.

**Commits:**
```
feat: add MetricsExporterFactory (Factory pattern)
feat: implement OTLPMetricsExporter
feat: update global-setup.ts for metrics initialization
feat: add PrometheusMetricsExporter template
test: integration tests for metrics export
```

---

### PHASE 5: Reporter Integration (Week 7)
**Goal:** Plug MetricsCollector into Reporter using Observer pattern

**Tasks:**

1. **Update Reporter for Observer pattern** (UPDATE)
   - [ ] Update `src/lib/reporter.ts`
   - [ ] Add `subscribe(listener: TestEventListener)` method
   - [ ] Add `unsubscribe(listener: TestEventListener)` method
   - [ ] Modify `onTestEnd()` to notify all listeners
   - [ ] Modify `onStepEnd()` to notify all listeners
   - [ ] Add comments: "See DESIGN_PATTERNS.md#observer-pattern"
   - [ ] Backward compatible: existing Reporter code still works

2. **Make MetricsCollector a TestEventListener** (UPDATE)
   - [ ] Update `src/lib/metrics/collector.ts`
   - [ ] Implement `TestEventListener` interface
   - [ ] Can now subscribe to Reporter

3. **Create test event listener interface** (NEW)
   - [ ] Create `src/lib/metrics/types.ts`
   - [ ] Add `TestEventListener` interface
   - [ ] Methods: `onTestBegin()`, `onTestEnd()`, `onStepEnd()`, etc.

4. **Wire up in global-setup.ts** (UPDATE)
   - [ ] Create Reporter instance
   - [ ] Create MetricsCollector instance
   - [ ] Subscribe: `reporter.subscribe(metricsCollector)`
   - [ ] Verify integration works

5. **Integration testing** (TEST)
   - [ ] Create `test/integration/reporter-metrics.test.ts`
   - [ ] Run actual Playwright tests
   - [ ] Verify metrics collected end-to-end
   - [ ] Verify traces still work
   - [ ] Verify both exported together

6. **Run full test suite** (VERIFY)
   - [ ] `npm test` - All tests PASS
   - [ ] Integration tests pass
   - [ ] E2E test runs successfully

**Deliverable:** Metrics collected from real Playwright tests.

**Commits:**
```
feat: implement Observer pattern in Reporter
feat: make MetricsCollector a TestEventListener
feat: wire up Reporter + MetricsCollector integration
test: integration tests with real Playwright tests
docs: update README with metrics feature
```

---

### PHASE 6: Configuration & Customization (Week 8)
**Goal:** Allow teams to customize metrics behavior

**Tasks:**

1. **Create MetricsConfig interface** (NEW)
   - [ ] Create `src/lib/metrics/config.ts`
   - [ ] Options:
     - `enabled: boolean`
     - `backend: 'otlp' | 'prometheus' | 'custom'`
     - `sampleRate: number` (0-1)
     - `flakynessStrategy: 'simple' | 'weighted'`
     - `otlpEndpoint: string`
     - `promPort: number`
     - `batchSize: number`
     - `flushInterval: number`

2. **Create config loader** (NEW)
   - [ ] Create `src/lib/metrics/config.loader.ts`
   - [ ] Load from environment variables:
     - `METRICS_ENABLED=true`
     - `METRICS_BACKEND=otlp`
     - `METRICS_SAMPLE_RATE=1.0`
     - `METRICS_FLAKINESS_STRATEGY=weighted`
     - `OTEL_EXPORTER_OTLP_ENDPOINT=...`
   - [ ] Load from `playwright.config.ts`:
     ```typescript
     export default defineConfig({
       use: {
         metricsConfig: {
           enabled: true,
           backend: 'otlp',
           flakynessStrategy: 'weighted',
         },
       },
     });
     ```

3. **Update factory to use config** (UPDATE)
   - [ ] Update all factories to load config
   - [ ] Pass config to exporter factory
   - [ ] Pass config to strategy factory
   - [ ] Sensible defaults (metrics enabled, OTLP backend)

4. **Add configuration tests** (TEST)
   - [ ] Create `test/unit/metrics/config.test.ts`
   - [ ] Test environment variable loading
   - [ ] Test config file loading
   - [ ] Test default values

5. **Documentation** (DOCS)
   - [ ] Create `docs/METRICS_CONFIGURATION.md`
   - [ ] Show how to enable/disable metrics
   - [ ] Show how to choose backends
   - [ ] Show how to change flakiness strategy

**Deliverable:** Teams can customize metrics via config.

**Commits:**
```
feat: add MetricsConfig interface
feat: add config loader (env vars + config file)
feat: update factories to use config
test: add configuration tests
docs: add metrics configuration guide
```

---

### PHASE 7: Documentation & Examples (Week 9)
**Goal:** Enable teams to use metrics

**Tasks:**

1. **Update main README.md** (UPDATE)
   - [ ] Add "Metrics" section
   - [ ] Quick start: "Metrics are enabled by default"
   - [ ] Show basic example
   - [ ] Link to detailed guide

2. **Create METRICS_GUIDE.md** (NEW)
   - [ ] What metrics are collected
   - [ ] How to view metrics in backend (Jaeger, Datadog, etc.)
   - [ ] Metrics reference (names, types, attributes)
   - [ ] Example dashboards
   - [ ] Example alerts

3. **Create EXTENSION_GUIDE.md** (NEW)
   - [ ] How to implement custom FlakynessStrategy
   - [ ] How to implement custom MetricsExporter
   - [ ] How to subscribe custom TestEventListener
   - [ ] Complete code examples
   - [ ] See: design-strategy/DESIGN_PATTERNS.md

4. **Create example files** (NEW)
   - [ ] Example `playwright.config.ts` with metrics
   - [ ] Example `global-setup.ts` with metrics
   - [ ] Example custom FlakynessStrategy
   - [ ] Example custom MetricsExporter
   - [ ] Example custom TestEventListener

5. **Update CONTRIBUTING.md** (UPDATE)
   - [ ] How to test metrics changes
   - [ ] How to add new metrics
   - [ ] Test coverage requirements (90%+)
   - [ ] Code style: Follow design patterns

6. **Create API documentation** (NEW)
   - [ ] Create `docs/API.md`
   - [ ] Document all interfaces
   - [ ] Document all types
   - [ ] Document configuration options
   - [ ] Auto-generate from JSDoc comments

7. **Add comments & TODO markers** (UPDATE)
   - [ ] Add comment to every file explaining its purpose
   - [ ] Link to design-strategy docs
   - [ ] Add TODO markers for future phases:
     - `TODO: [PHASE 8] Add sampling strategy`
     - `TODO: [PHASE 9] Add ML-based flakiness detection`

**Deliverable:** Complete documentation for teams to use metrics.

**Commits:**
```
docs: update README with metrics section
docs: add METRICS_GUIDE.md
docs: add EXTENSION_GUIDE.md
docs: add API documentation
docs: update CONTRIBUTING.md
feat: add example configurations and strategies
```

---

### PHASE 8: Quality Assurance & Release (Week 10)
**Goal:** Ensure quality and prepare for production

**Tasks:**

1. **E2E testing** (TEST)
   - [ ] Run real Playwright test suite
   - [ ] Verify metrics generated correctly
   - [ ] Verify traces still generated
   - [ ] Verify both exported to OTLP backend
   - [ ] Check for errors in CI logs

2. **Performance testing** (VERIFY)
   - [ ] Measure overhead of metrics (should be < 5%)
   - [ ] Compare test duration with/without metrics
   - [ ] Memory usage with/without metrics
   - [ ] Benchmark percentile calculations
   - [ ] Document findings in PR

3. **Security review** (VERIFY)
   - [ ] Validate OTLP endpoint (no secrets in URL)
   - [ ] Sanitize metrics attributes (no PII)
   - [ ] Validate configuration inputs
   - [ ] Check for injection vulnerabilities

4. **TypeScript validation** (VERIFY)
   - [ ] Run `npm run type-check`
   - [ ] Strict mode: `"strict": true` in tsconfig.json
   - [ ] No `any` types
   - [ ] All types properly defined

5. **Lint & format** (VERIFY)
   - [ ] Run `npm run lint`
   - [ ] Fix all errors
   - [ ] Run `npm run format`
   - [ ] No styling issues

6. **Coverage report** (VERIFY)
   - [ ] Run `npm test -- --coverage`
   - [ ] Target: 90%+ coverage for metrics subsystem
   - [ ] Identify and test uncovered lines
   - [ ] Generate HTML report

7. **Package preparation** (RELEASE)
   - [ ] Update `package.json` version: `minor` bump (1.x.0 → 1.(x+1).0)
   - [ ] Update `CHANGELOG.md`
   - [ ] Review all changes
   - [ ] Create GitHub release notes

8. **Publish to NPM** (RELEASE)
   - [ ] Run `npm publish`
   - [ ] Verify package available on NPM
   - [ ] Test installation in clean environment

9. **Deployment & monitoring** (DEPLOY)
   - [ ] Document upgrade path for existing users
   - [ ] Create migration guide (if breaking changes)
   - [ ] Monitor for issues from early adopters
   - [ ] Gather feedback

**Deliverable:** v1.0.0 metrics feature released and stable.

**Commits:**
```
test: add E2E metrics tests
perf: benchmark metrics overhead
docs: add performance benchmarks
test: verify 90%+ code coverage
chore: bump version to 1.1.0
chore: update CHANGELOG
release: v1.1.0 - Metrics auto-instrumentation
```

---

## File Structure Summary

```
playwright-opentelemetry-reporter/
├── design-strategy/
│   ├── DESIGN_PATTERNS.md          ✅ Created
│   ├── TDD_STRATEGY.md              ✅ Created
│   ├── METRICS_ARCHITECTURE.md      ✅ Created
│   └── IMPLEMENTATION_PLAN.md       ✅ Created (this file)
│
├── src/lib/metrics/                 [PHASE 1-8]
│   ├── index.ts                     Export public API
│   ├── types.ts                     All interfaces & types
│   ├── collector.ts                 MetricsCollector impl
│   ├── recorder.ts                  MetricRecorder impl
│   ├── config.ts                    MetricsConfig
│   ├── config.loader.ts             Config from env/file
│   ├── flakiness/
│   │   ├── strategy.ts              Interface
│   │   ├── simple.ts                Simple strategy
│   │   ├── weighted.ts              Weighted strategy
│   │   ├── detector.ts              Detector class
│   │   └── factory.ts               Strategy factory
│   ├── exporters/
│   │   ├── factory.ts               Exporter factory
│   │   ├── otlp.ts                  OTLP exporter
│   │   ├── prometheus.ts.template   Prometheus template
│   │   └── custom.ts.template       Custom template
│   └── utils/
│       ├── timing.ts                Duration tracking
│       ├── percentile.ts            Percentile calc
│       └── attributes.ts            Attribute builders
│
├── test/
│   ├── unit/metrics/
│   │   ├── collector.test.ts        [PHASE 1-2]
│   │   ├── recorder.test.ts         [PHASE 2]
│   │   ├── exporter.test.ts         [PHASE 4]
│   │   ├── flakiness.test.ts        [PHASE 3]
│   │   ├── config.test.ts           [PHASE 6]
│   │   ├── fixtures.ts              Test data
│   │   ├── mock-exporter.ts         Mock impl
│   │   └── utils.test.ts            Utility tests
│   └── integration/
│       ├── reporter-metrics.test.ts [PHASE 5]
│       └── exporter.test.ts         [PHASE 4]
│
├── docs/
│   ├── METRICS_GUIDE.md             [PHASE 7]
│   ├── METRICS_CONFIGURATION.md     [PHASE 6]
│   ├── EXTENSION_GUIDE.md           [PHASE 7]
│   └── API.md                       [PHASE 7]
│
├── README.md                        [PHASE 7] Update
├── CONTRIBUTING.md                  [PHASE 7] Update
├── CHANGELOG.md                      [PHASE 8] Update
└── global-setup.ts                  [PHASE 4-5] Update
```

---

## Success Criteria

- [ ] **Architecture**: All 5 design patterns correctly applied
- [ ] **Tests**: 90%+ code coverage for metrics subsystem
- [ ] **Documentation**: 100% of public API documented
- [ ] **Performance**: < 5% overhead vs. trace-only mode
- [ ] **Reusability**: 2+ reference implementations (OTLP, template)
- [ ] **Learning**: Every file has comments linking to design guides
- [ ] **Quality**: All linting, type checking, tests passing
- [ ] **Release**: NPM package published and stable

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Metrics overhead | HIGH | Benchmark performance; add sampling strategy |
| Breaking changes to traces | HIGH | Feature flag for metrics; separate phase 1 |
| Complex configuration | MEDIUM | Sensible defaults; clear docs with examples |
| Flakiness false positives | MEDIUM | Multiple strategies; user can choose |
| OTLP backend overload | MEDIUM | Sampling; batch exports; health checks |

---

## Learning Opportunities

**For Your Team:**
1. **Design Patterns** - See DESIGN_PATTERNS.md
2. **TDD Methodology** - See TDD_STRATEGY.md
3. **OpenTelemetry** - See METRICS_ARCHITECTURE.md
4. **TypeScript Best Practices** - See inline code comments
5. **Testing Strategies** - See test files

**Pair Programming:** Senior engineer pairs with 1-2 juniors per phase to transfer knowledge.

---

## Questions for Alignment

Before starting Phase 1:

1. **Timeline:** Is 10 weeks feasible? Can we parallelize any phases?
2. **Team:** Who will implement each phase? Do they have TDD experience?
3. **Review:** Who will review code? Weekly or per-phase reviews?
4. **Dependencies:** Any blockers (e.g., OpenTelemetry SDK version)?
5. **Monitoring:** How will we monitor metrics quality in production?

---

**Ready to begin Phase 1?** 🚀

Next steps:
1. Review this plan with team
2. Get approval to proceed
3. Start Phase 1 (interfaces + tests)
4. First milestone: Interfaces reviewed and tested

