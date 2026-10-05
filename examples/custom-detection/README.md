# Example: a custom detection

A complete, minimal contribution: one Sigma rule, its tests, and sample events you can paste into the playground.

| File                                       | Purpose                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| [`rule.yml`](rule.yml)                     | The Sigma rule. Detects `curl` or `wget` piped straight into a shell.    |
| [`tests.yml`](tests.yml)                   | Two positive and three negative tests, including the filter's exclusion. |
| [`sample-events.json`](sample-events.json) | Three events for the playground's _Custom JSON_ test data.               |

To contribute a rule like this, copy `rule.yml` to `detections/sigma/linux/<slug>.yml` and `tests.yml` to `detections/sigma/linux/<slug>.tests.yml`, then follow [Creating a detection](../../docs/creating-a-detection.md).

This directory is checked by the API test suite, so it cannot rot.
