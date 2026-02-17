# Meta Ads Agent Console

Next.js 14+ App Router workspace for a split-pane Meta Ads assistant UI.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Local Environment Variables

Create `.env.local` with:

```bash
META_ACCESS_TOKEN=your_meta_graph_access_token
META_GRAPH_BASE_URL=https://graph.facebook.com/v20.0
OPENAI_API_KEY=optional_future_ai_provider_key
```

- `META_ACCESS_TOKEN`: Used by `lib/meta-api-client.ts` for authenticated Graph API requests.
- `META_GRAPH_BASE_URL`: Optional override for Graph API version pinning or sandbox targets.
- `OPENAI_API_KEY`: Reserved for wiring model providers in `lib/ai-orchestration.ts`.

## Architecture Modules

- `app/`
  - `app/page.tsx`: split-pane shell entry route.
  - `app/chat/page.tsx`: chat-focused route with right-pane context cards.
  - `app/analytics/page.tsx`: analytics route with starter KPI table.
  - `app/api/agent/actions/route.ts`: validates and queues assistant actions.
  - `app/api/meta/proxy/route.ts`: validates and proxies Meta Graph API calls.
- `components/`
  - `components/layout/split-pane-shell.tsx`: reusable left-chat/right-pane layout shell.
  - `components/ui/*`: Shadcn-style baseline UI primitives (`Button`, `Card`).
- `lib/`
  - `lib/meta-api-client.ts`: Graph API client with token auth + error handling.
  - `lib/ai-orchestration.ts`: action-to-orchestration mapping for agent tasks.
  - `lib/validation.ts`: shared Zod schemas for API payload validation.
  - `lib/utils.ts`: Tailwind/Shadcn utility helpers.

## Design Notes

- Dark theme is default (`<html className="dark">`) with Tailwind tokens configured in `app/globals.css` and `tailwind.config.ts`.
- The split-pane shell is intended to match the design doc baseline: left chat workspace + right dynamic pane that changes by route.
