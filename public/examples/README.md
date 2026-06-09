# QuantCred Examples

QuantCred does not ship synthetic strategy-performance datasets.

Use verifiable public research sources or your own audit files. The current browser importer recognizes the Kenneth R. French Data Library factor CSV/ZIP format:

- Kenneth R. French Data Library: https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html

Supported schema headers:

```csv
date,return
```

```csv
date,strategy_001,strategy_002,strategy_003
```

```csv
date,symbol,side,quantity,price,fees,borrow_cost,spread_bps,adv,notional
```

```csv
date,symbol,weight,notional,sector,country,market_cap,adv
```

```csv
date,mkt,size,value,momentum,quality,low_vol
```

The Fama/French daily factors file is supported as an unmodified CSV or ZIP. QuantCred removes the descriptive header rows locally, converts percent factor returns to decimal returns, and excludes RF from strategy selection.
