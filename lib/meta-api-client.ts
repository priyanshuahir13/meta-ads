import { MetaProxyInput } from "@/lib/validation";

const META_GRAPH_BASE_URL = process.env.META_GRAPH_BASE_URL ?? "https://graph.facebook.com/v20.0";

export async function callMetaGraph(input: MetaProxyInput) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    throw new Error("META_ACCESS_TOKEN is not configured");
  }

  const url = new URL(`${META_GRAPH_BASE_URL}/${input.path.replace(/^\/+/, "")}`);
  Object.entries(input.params ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Meta Graph API request failed: ${response.status} ${errorBody}`);
  }

  return response.json();
}
