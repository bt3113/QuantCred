# CSV Format

QuantCred supports multiple auditable input formats. This document specifies headers only. It intentionally does not include synthetic performance rows.

## Single return stream

```csv
date,return
```

Returns should be decimal returns. Use `0.01` for 1%.

## Strategy matrix

```csv
date,strategy_001,strategy_002,strategy_003
```

Strategy-matrix mode enables DSR and PBO because it exposes the strategy-selection universe.

## Trades/orders

```csv
date,symbol,side,quantity,price,fees,borrow_cost,spread_bps,adv,notional
```

## Positions/holdings

```csv
date,symbol,weight,notional,sector,country,market_cap,adv
```

## Factor returns

```csv
date,mkt,size,value,momentum,quality,low_vol
```

The Kenneth R. French factor file is also supported in its unmodified CSV/ZIP form.

## Validation rules

QuantCred warns about:

- missing dates
- duplicate dates
- non-numeric return cells
- very small samples
- return values that look like percentages instead of decimals
- impossible simple returns
- zero or near-zero volatility
- near-identical strategy columns
