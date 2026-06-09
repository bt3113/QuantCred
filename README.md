# QuantCred

QuantCred is a browser-only Backtest Credibility Auditor.

It helps researchers inspect whether a backtest result is statistically credible after checking:

- sample length
- non-normal returns
- naive Sharpe evidence
- Probabilistic Sharpe Ratio
- Deflated Sharpe Ratio
- Probability of Backtest Overfitting when a strategy matrix is supplied

QuantCred does not predict returns, recommend securities, or generate trading signals.

## Run locally

Open `index.html` in a browser, or serve the folder with any static server.

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Deploy with GitHub Pages

Use:

```text
Repository Settings → Pages → Deploy from branch → main → /root
```

## CSV formats

Single strategy:

```csv
date,return
2024-01-02,0.004
2024-01-03,-0.002
```

Strategy matrix:

```csv
date,momentum_v1,mean_reversion_v2,breakout_v3
2024-01-02,0.002,-0.001,0.004
2024-01-03,-0.003,0.001,0.002
```

## Privacy

CSV files are parsed locally in the browser. This app has no custom backend and does not upload the CSV to an application server.

## Methodology

See `docs/methodology.md`.
