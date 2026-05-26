# Local Observability Quick Start

This repo includes a Docker Compose stack for local Playwright telemetry:

| Service                      | URL                                                                              | Purpose                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Grafana local dashboard      | http://localhost:3000/d/playwright-otel/playwright-test-insights                 | Short-run Playwright dashboard                                   |
| Grafana production dashboard | http://localhost:3000/d/playwright-otel-prod/playwright-test-insights-production | Production-style dashboard using `increase(...)` and `rate(...)` |
| Grafana Explore              | http://localhost:3000/explore                                                    | Query Prometheus metrics or inspect Jaeger traces                |
| Prometheus                   | http://localhost:9090/query                                                      | Raw metric queries                                               |
| Jaeger                       | http://localhost:16686                                                           | Trace search and waterfall view                                  |
| OpenTelemetry Collector      | http://localhost:4318                                                            | OTLP HTTP receiver used by the reporter                          |

Grafana login is disabled for local use.

## Prerequisites

1. Docker or Rancher Desktop is running.
2. Node 22.x or Node 24.x is active.
3. Node dependencies are installed:

```sh
npm install
```

## Start The Stack

```sh
npm run otel:up
```

This starts:

- Jaeger for traces.
- OpenTelemetry Collector for OTLP ingestion.
- Prometheus for metric storage.
- Grafana with provisioned Prometheus and Jaeger data sources.

## Generate Telemetry

Build the reporter first:

```sh
npm run build
```

Then run the Playwright examples:

```sh
npm run playwright
```

The example suite includes a retry scenario, so Playwright can produce flaky test telemetry when the first attempt fails and a retry passes.

For a quick smoke test that does not launch a browser, run:

```sh
npm run otel:verify
```

## Verify Metrics

Open Grafana:

```text
http://localhost:3000/d/playwright-otel/playwright-test-insights
```

The production-style dashboard is also provisioned locally:

```text
http://localhost:3000/d/playwright-otel-prod/playwright-test-insights-production
```

Or open Prometheus:

```text
http://localhost:9090/query
```

Useful Prometheus queries:

```promql
test_count_total
```

```promql
sum by (test_result_status) (test_count_total)
```

```promql
test_duration_milliseconds_sum
```

```promql
test_duration_milliseconds_bucket
```

```promql
histogram_quantile(0.95, sum by (le) (test_duration_milliseconds_bucket))
```

```promql
test_step_duration_milliseconds_sum
```

```promql
topk(10, sum by (test_suite_name, test_case_name) (max_over_time(test_count_total{test_result_status="failed"}[1h])))
```

Histogram buckets are cumulative. It is normal for lower buckets to show `0` when a test duration is larger than those bucket boundaries. Use `_sum`, `_count`, or `histogram_quantile(...)` when checking durations.

The local dashboard uses `max_over_time(...[$__range])` for summary and table panels instead of `increase(...)`. That works better for short local Playwright runs because the test process exits quickly and Prometheus may only have one useful sample for each completed metric series.

The production dashboard uses `increase(...)` for counters and `rate(...)` for histogram bucket, sum, and count series. Use it when Prometheus continuously scrapes long-lived metric streams or repeated CI runs over time.

## Verify Traces

Open Jaeger:

```text
http://localhost:16686
```

Select the `@internal/playwright-opentelemetry-reporter` service and search for traces.

You can also use Grafana Explore:

```text
http://localhost:3000/explore
```

Choose the `Jaeger` data source and search for recent traces.

## Local Infra Files

| File                                               | Role                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `docker-compose.local-otel.yml`                    | Starts Jaeger, OpenTelemetry Collector, Prometheus, and Grafana                          |
| `otel-collector-local.yaml`                        | Receives OTLP traces and metrics, sends traces to Jaeger, exposes metrics for Prometheus |
| `prometheus-local.yaml`                            | Scrapes collector metrics from `otel-collector:9464`                                     |
| `grafana/provisioning/datasources/datasources.yml` | Adds Prometheus and Jaeger data sources                                                  |
| `grafana/provisioning/dashboards/dashboards.yml`   | Loads dashboards into Grafana                                                            |
| `grafana/dashboards/playwright-otel.json`          | Local short-run Playwright telemetry dashboard                                           |
| `grafana/dashboards/playwright-otel-prod.json`     | Production-style Playwright telemetry dashboard                                          |
| `scripts/verify-local-otel.js`                     | Sends synthetic reporter telemetry through the same OTLP endpoints                       |

## Stop The Stack

```sh
npm run otel:down
```

## Troubleshooting

If Grafana has no data, first confirm Prometheus has the raw metric:

```promql
test_count_total
```

If Prometheus has no data, generate telemetry again:

```sh
npm run build
npm run playwright
```

Then check collector logs:

```sh
npm run otel:logs
```

If dashboard JSON changed but Grafana still shows the old view, restart Grafana:

```sh
docker compose -f docker-compose.local-otel.yml restart grafana
```
