# Deflated Sharpe Ratio

## Definition

Deflated Sharpe Ratio adjusts the benchmark hurdle used in Sharpe-ratio inference when multiple strategy variants or trials were evaluated before selecting the best-looking result.

## Inputs

- selected strategy return stream
- selected strategy score
- score distribution across tested variants
- observation count
- skewness
- raw kurtosis

## Interpretation

A high naive score is less persuasive when many candidate strategies were tested. QuantCred therefore reports both the selected score and the deflated probability when multiple variants are available.

## Failure modes

- Failed trials were not uploaded or declared.
- Strategy columns are near-duplicates.
- The selected strategy was chosen outside the supplied matrix.

## Implementation notes

The typed implementation lives in `src/core/stats/dsr.ts`. The browser audit path uses `src/math/audit-v2.js` for the live static app.
