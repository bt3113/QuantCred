# QuantCred Methodology

QuantCred is a statistical audit tool for return series and strategy matrices. It is designed to help identify fragile backtests, not to forecast market returns.

## Native Sharpe Ratio

QuantCred computes Sharpe at the native frequency of the uploaded returns:

```text
SR = mean(returns) / standard_deviation(returns)
```

Annualization is intentionally not used as the primary audit statistic because Sharpe-ratio inference depends on serial structure, sample length, skewness, and kurtosis.

Reference:

- Lo, A. W. (2002). The Statistics of Sharpe Ratios. Financial Analysts Journal. https://www.tandfonline.com/doi/abs/10.2469/faj.v58.n4.2453

## Probabilistic Sharpe Ratio

The Probabilistic Sharpe Ratio estimates the probability that an observed Sharpe exceeds a benchmark Sharpe after accounting for sample length, skewness, and kurtosis.

```text
PSR(c) = Φ((SR - c) * sqrt(T - 1) / sqrt(1 - skew * SR + ((kurtosis - 1) / 4) * SR^2))
```

Default benchmark:

```text
c = 0
```

References:

- Bailey, D. H. and López de Prado, M. (2012). The Sharpe Ratio Efficient Frontier. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1821643
- Portfolio Optimizer explanation of PSR and MinTRL. https://portfoliooptimizer.io/blog/the-probabilistic-sharpe-ratio-bias-adjustment-confidence-intervals-hypothesis-testing-and-minimum-track-record-length/

## Minimum Track Record Length

Minimum Track Record Length estimates the number of observations required for a Sharpe claim to reach a selected confidence level.

```text
MinTRL(c) = (1 - skew * SR + ((kurtosis - 1) / 4) * SR^2) * (z_(1-alpha) / (SR - c))^2
```

Reference:

- Bailey, D. H. and López de Prado, M. (2012). The Sharpe Ratio Efficient Frontier. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1821643

## Deflated Sharpe Ratio

Deflated Sharpe Ratio raises the Sharpe benchmark to account for multiple testing and selected-winner bias. It is relevant when many strategy variants or parameter combinations were tested before selecting the best-looking result.

References:

- Bailey, D. H. and López de Prado, M. (2014). The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and Non-Normality. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551
- Harvey, C. R., Liu, Y., and Zhu, H. (2016). ... and the Cross-Section of Expected Returns. Review of Financial Studies. https://academic.oup.com/rfs/article/29/1/5/1843824

## Probability of Backtest Overfitting

When a strategy matrix is supplied, QuantCred uses combinatorially symmetric cross-validation to estimate Probability of Backtest Overfitting.

Process:

1. Split the return matrix into equal chronological blocks.
2. Generate in-sample and out-of-sample block combinations.
3. Select the best in-sample strategy for each split.
4. Rank that selected strategy out of sample.
5. Estimate the fraction of splits where the selected strategy falls below the out-of-sample median.

Reference:

- Bailey, D. H., Borwein, J. M., López de Prado, M., and Zhu, Q. J. (2016). The Probability of Backtest Overfitting. Journal of Computational Finance. https://ideas.repec.org/a/rsk/journ0/2471206.html

## Interpretation limits

QuantCred output depends on the uploaded data and declared strategy universe. If a user uploads only the final chosen strategy and omits unsuccessful trials, the app cannot fully measure strategy-selection bias.
