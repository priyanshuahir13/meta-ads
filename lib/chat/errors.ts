import type { BudgetValidationError } from '../policies/budget.js';

export interface ChatErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    field?: string;
    meta?: Record<string, unknown>;
  };
}

export function toChatBudgetRejection(error: BudgetValidationError): ChatErrorResponse {
  return {
    ok: false,
    error: {
      code: error.code,
      field: error.field,
      message: error.message,
      meta: {
        ...error.meta,
        source: 'budget-policy',
      },
    },
  };
}
