# Probabilistic Sharpe Ratio

## Definition

The Probabilistic Sharpe Ratio estimates the probability that an observed return-volatility ratio exceeds a benchmark after accounting for observation count, skewness, and raw kurtosis.

## Inputs

- observed score
- observation count
- skewness
- raw kurtosis
- benchmark score

## Formula

```text
PSR(c) = Phi((SR - c) * sqrt(T - 1) / sqrt(1 - skew * SR + ((kurtosis - 1) / 4) * SR^2))
```

## Assumptions

- The input series is a simple return series.
- Raw kurtosis is used, not excess kurtosis.
- The score is computed at native frequency.

## Failure modes

- Too few observations.
- Constant or near-constant returns.
- Incorrectly scaled percent returns.
- Non-return columns uploaded as strategy columns.

## Implementation notes

The implementation lives in `src/core/stats/psr.ts` and the production browser audit path is routed through `src/math/audit-v2.js`.
