export interface MetaApiPayload {
  endpoint: 'campaign' | 'ad_set';
  body: Record<string, unknown>;
}

export interface MetaApiResponse {
  ok: true;
  id: string;
}

export async function callMetaPublishApi(payload: MetaApiPayload): Promise<MetaApiResponse> {
  return {
    ok: true,
    id: `${payload.endpoint}_${Math.random().toString(36).slice(2, 10)}`,
  };
}
