export type InputMode =
  | "single_return_stream"
  | "strategy_matrix"
  | "trades"
  | "positions"
  | "factor_returns"
  | "audit_manifest"
  | "incubation_append";

export type Severity = "info" | "warning" | "critical";
export type CheckStatus = "pass" | "fail" | "unknown";

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  files: WorkspaceFile[];
  audits: AuditRun[];
  reports: AuditReportSummary[];
}

export interface WorkspaceFile {
  id: string;
  name: string;
  type: "returns" | "strategy_matrix" | "trades" | "positions" | "factors" | "manifest" | "incubation";
  sha256: string;
  rowCount: number;
  columnCount: number;
  importedAt: string;
}

export interface AuditRun {
  id: string;
  workspaceId: string;
  generatedAt: string;
  selectedStrategy?: string;
  configHash: string;
  reportHash: string;
}

export interface AuditReportSummary {
  id: string;
  generatedAt: string;
  reportHash: string;
  decision: CapitalReadinessDecision;
}

export interface AuditManifest {
  strategy_id: string;
  researcher: string;
  asset_class: string;
  frequency: "daily" | "weekly" | "monthly" | "intraday" | "other";
  backtest_start: string;
  backtest_end: string;
  selected_strategy?: string;
  declared_trials?: number;
  parameter_grid?: Record<string, Array<string | number | boolean>>;
  data_assumptions?: {
    point_in_time?: boolean;
    survivorship_free?: boolean;
    corporate_actions_adjusted?: boolean;
    transaction_costs_included?: boolean;
  };
  cost_assumptions?: CostConfig;
  leakage_checklist?: LeakageChecklist;
}

export interface AuditProvenance {
  appVersion: string;
  commitSha: string;
  buildTime: string;
  generatedAt: string;
  inputHashes: Record<string, string>;
  configHash: string;
  reportHash: string;
  metricVersions: Record<string, string>;
}

export interface TrialLedgerEntry {
  id: string;
  timestamp: string;
  strategyName: string;
  hypothesis: string;
  parameterSet: Record<string, string | number | boolean>;
  universe: string;
  rebalanceRule: string;
  costModel: string;
  resultSharpe?: number;
  resultMaxDrawdown?: number;
  accepted: boolean;
  rejectionReason?: string;
}

export type TrialCountMode =
  | "single_backtest"
  | "declared_manual_trials"
  | "strategy_matrix_columns"
  | "manifest_parameter_grid"
  | "conservative_estimate";

export interface StrategyMatrixAudit {
  strategyNames: string[];
  selectedStrategy: string;
  selectionMetric: "sharpe" | "sortino" | "cagr" | "calmar" | "user_selected";
  inSampleRank: number;
  outOfSampleRank?: number;
  pbo?: number;
  rankStability?: number;
}

export interface PboConfig {
  partitions: number;
  minTrainPartitions: number;
  metric: "sharpe" | "sortino" | "return_drawdown" | "psr";
  allowNegativeReturns: boolean;
  randomSeed?: number;
}

export interface PboResult {
  pbo: number;
  logitValues: number[];
  inSampleRanks: number[];
  outOfSampleRanks: number[];
  degradation: number;
  selectedStrategyMedianOosRank: number;
}

export interface ParameterCell {
  params: Record<string, string | number>;
  sharpe: number;
  dsr: number;
  maxDrawdown: number;
  turnover?: number;
  selected: boolean;
}

export interface ParameterAtlas {
  dimensions: string[];
  cells: ParameterCell[];
  plateauScore: number;
  peakFragilityScore: number;
}

export interface SubperiodResult {
  periodStart: string;
  periodEnd: string;
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpe: number;
  maxDrawdown: number;
  hitRate: number;
  skew: number;
  kurtosis: number;
}

export interface RegimeAudit {
  regime: string;
  observations: number;
  meanReturn: number;
  volatility: number;
  sharpe: number;
  maxDrawdown: number;
  contributionToTotalReturn: number;
}

export interface CostConfig {
  commissionBps: number;
  spreadCaptureFraction: number;
  slippageBps: number;
  borrowCostAnnualBps: number;
  marketImpactCoefficient: number;
  maxAdvParticipation: number;
}

export interface CapacityPoint {
  capital: number;
  grossReturn: number;
  estimatedCost: number;
  netReturn: number;
  netSharpe: number;
  maxAdvParticipation: number;
}

export interface FactorAttribution {
  alphaAnnualized: number;
  alphaTStat: number;
  beta: Record<string, number>;
  betaTStats: Record<string, number>;
  rSquared: number;
  residualSharpe: number;
  rawSharpe: number;
  explainedVolatilityFraction: number;
}

export interface DataIntegrityCheck {
  id: string;
  severity: Severity;
  status: CheckStatus;
  message: string;
}

export interface LeakageChecklist {
  point_in_time_data: "yes" | "no" | "unknown";
  survivorship_free_universe: "yes" | "no" | "unknown";
  corporate_actions_adjusted: "yes" | "no" | "unknown";
  delisted_assets_included: "yes" | "no" | "unknown";
  feature_lag_days?: number;
  signal_timestamp_before_trade_timestamp: "yes" | "no" | "unknown";
  transaction_costs_included: "yes" | "no" | "unknown";
}

export interface LockedStrategy {
  strategyId: string;
  lockDate: string;
  reportHash: string;
  selectedConfigHash: string;
  backtestEndDate: string;
}

export interface IncubationResult {
  liveStart: string;
  liveEnd: string;
  liveObservations: number;
  backtestSharpe: number;
  liveSharpe: number;
  liveDrawdown: number;
  liveHitRate: number;
  liveVsBacktestZScore: number;
  degradationRatio: number;
  consistencyStatus: "consistent" | "weak" | "failed" | "insufficient_data";
}

export type CapitalReadinessDecision =
  | "reject"
  | "research_more"
  | "incubate"
  | "small_capital_pilot"
  | "candidate_for_allocation";

export interface CapitalReadinessScore {
  total: number;
  components: {
    statisticalCredibility: number;
    multipleTestingControl: number;
    robustness: number;
    costCapacity: number;
    factorIndependence: number;
    dataIntegrity: number;
    liveIncubation: number;
  };
  decision: CapitalReadinessDecision;
  overrides: string[];
}
