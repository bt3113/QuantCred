# QuantCred Research-Governance Architecture

QuantCred is positioned as a local-first backtest credibility auditor, not as a generic performance tear sheet. The architecture prioritizes false-discovery control, semantic schema detection, search-process disclosure, factor exposure review, implementation-cost review, and time-series validation gaps.

## Evidence base

The implementation follows these research and engineering principles:

1. Multiple strategy testing inflates apparent performance. QuantCred therefore treats strategy matrices and trial-ledger counts as governance evidence rather than as ordinary return columns.
2. Deflated Sharpe-style logic requires a trial universe or trial estimate. Single-stream audits are capped unless search history is supplied.
3. Purged / embargo-style validation is needed when train/test folds can leak information through temporal overlap.
4. Factor attribution is needed because a high raw Sharpe may be explained by common factor exposure rather than residual alpha.
5. Cost/capacity analysis is mandatory when files contain gross return, net return, turnover, bps cost fields, and ADV participation.

## Implemented modules

- `src/math/audit-v5.js`: semantic schema, cost/capacity, tail-risk and verdict override layer.
- `src/math/auditPlus.js`: factor attribution, time-series validation gap summary, and search-history governance wrapper.
- `src/math/factorAttribution.js`: browser-safe factor correlation and residual-Sharpe proxy module.
- `src/math/timeSeriesCv.js`: local time-series validation gap utility.
- `src/governance-ui.js`: browser UI for validation gaps, trial ledger JSON, and manifest JSON.
- `scripts/quantcred-cli.mjs`: local CLI for offline audits.
- `tests/fixtures/governance-golden.test.ts`: permanent regression tests for schema gates, tail risk, cost/capacity, and search-governance behavior.

## Report obligations

Every professional report should include:

- source file name
- raw input hash
- prepared input hash
- schema mode
- selected return stream
- daily and annualized Sharpe
- PSR / DSR / PBO where applicable
- tail-risk status
- cost/capacity status where applicable
- factor attribution status where applicable
- time-series validation gap status
- effective trial count source
- binding rule for the headline verdict

## Hard verdict rules

- Unsupported schema blocks all diagnostics.
- Cost/capacity metadata cannot be selected as a strategy return stream.
- Gross performance that disappears after net-cost fields receives a reject verdict.
- Extreme negative skew or extreme raw kurtosis receives a reject verdict.
- High PBO receives a likely-overfit verdict.
- Missing time-series validation gaps caps otherwise credible single-stream reports.
- Missing trial history caps otherwise credible single-stream reports.
- Factor-explained performance caps headline verdict at research_more.

## Browser architecture

The app remains static and local-first. GitHub Pages hosts the static assets. CSV and ZIP files are parsed in the browser; no default strategy upload server is used. Heavy calculations should continue moving toward Web Workers as the test suite expands.
