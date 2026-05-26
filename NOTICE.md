# Notice

This package is distributed under the Apache License 2.0.

It includes code derived from the MIT-licensed `@aergonaut/playwright-opentelemetry-reporter` project.

Original project:

- Package: `@aergonaut/playwright-opentelemetry-reporter`
- Repository: `https://github.com/aergonaut/playwright-opentelemetry-reporter`
- Original copyright: `Copyright (c) 2019 Chris Fung`

Thank you to Chris Fung and the original project contributors for making the reporter available under the MIT License.

The upstream MIT License notice is preserved in `THIRD_PARTY_NOTICES.md`.

## Internal Changes

This internal version has been adapted for internal usage under the package name:

```text
@internal/playwright-opentelemetry-reporter
```

Notable internal changes include:

- Added reporter-level metric configuration support, including custom metric attributes.
- Added suite-name attributes to emitted metrics.
- Added reporter-level trace configuration support through `traces.enabled` and `traces.attributes`.
- Added custom trace attributes on test spans and step spans.
- Added support for disabling reporter-created traces while keeping metrics independent.
- Added OpenTelemetry metric dashboards for local and production-style Prometheus/Grafana usage.
- Added local OpenTelemetry Collector, Prometheus, Grafana, and Jaeger quick-start files.
- Added Playwright e2e examples for latency, parallel execution, flaky tests, retries, and duration histograms.
- Updated documentation and examples for GitLab-style CI metadata.
- Renamed package references from the original public package name to the internal package scope.

The Apache License 2.0 text for this internal package is preserved in `LICENSE`.
