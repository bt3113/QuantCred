# QuantCred

QuantCred is a static, browser-only Backtest Credibility Auditor.

It helps researchers inspect whether a backtest result is statistically credible after checking:

- sample length
- non-normal returns
- native return/volatility evidence
- Probabilistic Sharpe Ratio
- Deflated Sharpe Ratio
- Probability of Backtest Overfitting when a strategy matrix is supplied
- input provenance hashes
- data-integrity flags
- capital-readiness scoring inputs

QuantCred does not predict returns, recommend securities, or generate trading signals.

## Privacy model

Uploaded CSV/ZIP files are processed locally in the browser. The app has no custom backend and does not upload strategy data to an application server by default.

## Run locally

```bash
npm install
npm run dev
```

For the legacy static path, you can also serve the folder directly:

```bash
python3 -m http.server 8000
```

## Build and test

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Deploy

GitHub Pages deployment is configured through `.github/workflows/pages.yml`. The workflow builds the static site and deploys the `dist` artifact through GitHub Pages Actions.

## Supported input schemas

Single return stream:

```csv
date,return
```

Strategy matrix:

```csv
date,strategy_001,strategy_002,strategy_003
```

Trades/orders:

```csv
date,symbol,side,quantity,price,fees,borrow_cost,spread_bps,adv,notional
```

Positions/holdings:

```csv
date,symbol,weight,notional,sector,country,market_cap,adv
```

Factor returns:

```csv
date,mkt,size,value,momentum,quality,low_vol
```

Audit manifest JSON is documented in `public/schemas/quantcred-manifest.schema.json`.

## Real data policy

The repository does not ship synthetic performance datasets. Use verifiable public sources or your own files. The current browser importer recognizes the Kenneth R. French Data Library factor CSV/ZIP format and converts the factor returns from percent to decimal returns locally while excluding RF from strategy selection.

## Methodology

See `docs/methodology.md` and `public/docs/`.
