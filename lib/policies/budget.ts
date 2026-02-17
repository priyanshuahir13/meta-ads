export const BUDGET_LIMITS = {
  CAMPAIGN_DAILY_MAX: 500_000,
  CAMPAIGN_LIFETIME_MAX: 5_000_000,
  AD_SET_DAILY_MAX: 100_000,
  AD_SET_LIFETIME_MAX: 1_000_000,
} as const;

export const BUDGET_ERROR_CODES = {
  INVALID_SCOPE: 'BUDGET_INVALID_SCOPE',
  INVALID_OPTIMIZATION_MODE: 'BUDGET_INVALID_OPTIMIZATION_MODE',
  MISSING_BUDGET: 'BUDGET_MISSING_BUDGET',
  MALFORMED_VALUE: 'BUDGET_MALFORMED_VALUE',
  BELOW_MIN: 'BUDGET_BELOW_MIN',
  EXCEEDS_MAX: 'BUDGET_EXCEEDS_MAX',
} as const;

export type BudgetScope = 'campaign' | 'ad_set';
export type OptimizationMode = 'daily' | 'lifetime';

export interface BudgetValidationInput {
  scope: BudgetScope;
  optimizationMode: OptimizationMode;
  amount?: unknown;
}

export interface BudgetValidationError {
  code: (typeof BUDGET_ERROR_CODES)[keyof typeof BUDGET_ERROR_CODES];
  message: string;
  field: 'scope' | 'optimizationMode' | 'amount';
  meta?: {
    max?: number;
    min?: number;
    provided?: unknown;
    scope?: string;
    optimizationMode?: string;
  };
}

export interface BudgetValidationResult {
  ok: boolean;
  error?: BudgetValidationError;
}

const MIN_BUDGET = 1;

const MAX_BY_SCOPE: Record<BudgetScope, Record<OptimizationMode, number>> = {
  campaign: {
    daily: BUDGET_LIMITS.CAMPAIGN_DAILY_MAX,
    lifetime: BUDGET_LIMITS.CAMPAIGN_LIFETIME_MAX,
  },
  ad_set: {
    daily: BUDGET_LIMITS.AD_SET_DAILY_MAX,
    lifetime: BUDGET_LIMITS.AD_SET_LIFETIME_MAX,
  },
};

export function validateBudget(input: BudgetValidationInput): BudgetValidationResult {
  if (!isScope(input.scope)) {
    return {
      ok: false,
      error: {
        code: BUDGET_ERROR_CODES.INVALID_SCOPE,
        field: 'scope',
        message: `Budget scope must be one of campaign or ad_set. Received: ${String(input.scope)}`,
        meta: { scope: String(input.scope) },
      },
    };
  }

  if (!isOptimizationMode(input.optimizationMode)) {
    return {
      ok: false,
      error: {
        code: BUDGET_ERROR_CODES.INVALID_OPTIMIZATION_MODE,
        field: 'optimizationMode',
        message: `Optimization mode must be daily or lifetime. Received: ${String(input.optimizationMode)}`,
        meta: { optimizationMode: String(input.optimizationMode) },
      },
    };
  }

  if (input.amount === undefined || input.amount === null || input.amount === '') {
    return {
      ok: false,
      error: {
        code: BUDGET_ERROR_CODES.MISSING_BUDGET,
        field: 'amount',
        message: 'Budget amount is required for publish operations.',
      },
    };
  }

  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || Number.isNaN(input.amount)) {
    return {
      ok: false,
      error: {
        code: BUDGET_ERROR_CODES.MALFORMED_VALUE,
        field: 'amount',
        message: `Budget amount must be a finite number. Received: ${String(input.amount)}`,
        meta: { provided: input.amount },
      },
    };
  }

  if (input.amount < MIN_BUDGET) {
    return {
      ok: false,
      error: {
        code: BUDGET_ERROR_CODES.BELOW_MIN,
        field: 'amount',
        message: `Budget amount must be at least ${MIN_BUDGET}. Received: ${input.amount}`,
        meta: { min: MIN_BUDGET, provided: input.amount },
      },
    };
  }

  const max = MAX_BY_SCOPE[input.scope][input.optimizationMode];

  if (input.amount > max) {
    return {
      ok: false,
      error: {
        code: BUDGET_ERROR_CODES.EXCEEDS_MAX,
        field: 'amount',
        message: `Budget amount exceeds ${input.scope} ${input.optimizationMode} max of ${max}. Received: ${input.amount}`,
        meta: { max, provided: input.amount, scope: input.scope, optimizationMode: input.optimizationMode },
      },
    };
  }

  return { ok: true };
}

function isScope(scope: unknown): scope is BudgetScope {
  return scope === 'campaign' || scope === 'ad_set';
}

function isOptimizationMode(mode: unknown): mode is OptimizationMode {
  return mode === 'daily' || mode === 'lifetime';
}
