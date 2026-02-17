import { NextResponse } from "next/server";

import { callMetaGraph } from "@/lib/meta-api-client";
import { metaProxySchema } from "@/lib/validation";

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = metaProxySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const data = await callMetaGraph(parsed.data);
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Meta Graph API proxy error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
