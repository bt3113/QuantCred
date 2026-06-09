# CSV Format

QuantCred supports two CSV formats.

## Single-strategy mode

Use this when you have one return stream.

```csv
date,return
2024-01-02,0.004
2024-01-03,-0.002
2024-01-04,0.001
```

Returns should be decimal returns. Use `0.01` for 1%.

## Strategy-matrix mode

Use this when you tested multiple strategy variants.

```csv
date,momentum_v1,mean_reversion_v2,breakout_v3
2024-01-02,0.002,-0.001,0.004
2024-01-03,-0.003,0.001,0.002
2024-01-04,0.005,0.002,-0.001
```

Strategy-matrix mode enables the strongest audit because DSR and PBO require information about the strategy-selection process.

## Validation rules

QuantCred warns about:

- missing dates
- duplicate dates
- non-numeric return cells
- very small samples
- return values that look like percentages instead of decimals
- zero or near-zero volatility
