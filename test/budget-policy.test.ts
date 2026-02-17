import test from 'node:test';
import assert from 'node:assert/strict';

import { BUDGET_ERROR_CODES, BUDGET_LIMITS, validateBudget } from '../lib/policies/budget.js';
import { publishAdSet, publishCampaign } from '../lib/endpoints/publish.js';

test('accepts campaign daily budget exactly at max boundary', () => {
  const result = validateBudget({
    scope: 'campaign',
    optimizationMode: 'daily',
    amount: BUDGET_LIMITS.CAMPAIGN_DAILY_MAX,
  });

  assert.equal(result.ok, true);
});

test('rejects campaign lifetime budget above max boundary', () => {
  const result = validateBudget({
    scope: 'campaign',
    optimizationMode: 'lifetime',
    amount: BUDGET_LIMITS.CAMPAIGN_LIFETIME_MAX + 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, BUDGET_ERROR_CODES.EXCEEDS_MAX);
});

test('rejects ad set daily budget above max boundary', () => {
  const result = validateBudget({
    scope: 'ad_set',
    optimizationMode: 'daily',
    amount: BUDGET_LIMITS.AD_SET_DAILY_MAX + 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, BUDGET_ERROR_CODES.EXCEEDS_MAX);
});

test('rejects malformed budgets', () => {
  const malformed = validateBudget({
    scope: 'ad_set',
    optimizationMode: 'daily',
    amount: '1000',
  });

  assert.equal(malformed.ok, false);
  assert.equal(malformed.error?.code, BUDGET_ERROR_CODES.MALFORMED_VALUE);
});

test('publish campaign rejects invalid budget and never reaches Meta API call', async () => {
  let called = false;

  const response = await publishCampaign(
    {
      name: 'Test Campaign',
      optimizationMode: 'daily',
      budget: BUDGET_LIMITS.CAMPAIGN_DAILY_MAX + 10,
    },
    async () => {
      called = true;
      return { ok: true, id: 'meta_123' };
    },
  );

  assert.equal(called, false);
  assert.equal(response.ok, false);
  if (response.ok) throw new Error('Expected a rejection response');
  assert.equal(response.error.code, BUDGET_ERROR_CODES.EXCEEDS_MAX);
});

test('publish ad set rejects missing budget and returns structured chat error', async () => {
  const response = await publishAdSet(
    {
      name: 'Test Ad Set',
      optimizationMode: 'daily',
      budget: undefined,
    },
    async () => ({ ok: true, id: 'meta_456' }),
  );

  assert.equal(response.ok, false);
  if (response.ok) throw new Error('Expected a rejection response');
  assert.equal(response.error.code, BUDGET_ERROR_CODES.MISSING_BUDGET);
  assert.equal(response.error.meta?.source, 'budget-policy');
});
