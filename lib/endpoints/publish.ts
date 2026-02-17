import { toChatBudgetRejection, type ChatErrorResponse } from '../chat/errors.js';
import { callMetaPublishApi, type MetaApiResponse } from '../meta-api/client.js';
import { validateBudget, type BudgetScope, type OptimizationMode } from '../policies/budget.js';

interface PublishBudgetRequest {
  budget: unknown;
  optimizationMode: OptimizationMode;
  name: string;
}

interface PublishSuccessResponse {
  ok: true;
  id: string;
}

type PublishResponse = PublishSuccessResponse | ChatErrorResponse;

type MetaPublishCaller = (payload: {
  endpoint: 'campaign' | 'ad_set';
  body: Record<string, unknown>;
}) => Promise<MetaApiResponse>;

async function validateBudgetOrReject(
  scope: BudgetScope,
  request: PublishBudgetRequest,
): Promise<PublishResponse | null> {
  const validation = validateBudget({
    scope,
    optimizationMode: request.optimizationMode,
    amount: request.budget,
  });

  if (!validation.ok && validation.error) {
    return toChatBudgetRejection(validation.error);
  }

  return null;
}

export async function publishCampaign(
  request: PublishBudgetRequest,
  publishApi: MetaPublishCaller = callMetaPublishApi,
): Promise<PublishResponse> {
  const rejection = await validateBudgetOrReject('campaign', request);
  if (rejection) return rejection;

  const result = await publishApi({
    endpoint: 'campaign',
    body: {
      name: request.name,
      dailyOrLifetimeBudget: request.budget,
      optimizationMode: request.optimizationMode,
    },
  });

  return result;
}

export async function publishAdSet(
  request: PublishBudgetRequest,
  publishApi: MetaPublishCaller = callMetaPublishApi,
): Promise<PublishResponse> {
  const rejection = await validateBudgetOrReject('ad_set', request);
  if (rejection) return rejection;

  const result = await publishApi({
    endpoint: 'ad_set',
    body: {
      name: request.name,
      adSetBudget: request.budget,
      optimizationMode: request.optimizationMode,
    },
  });

  return result;
}
