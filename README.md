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
GEMINI_API_KEY=optional_google_ai_key
GEMINI_MODEL=gemini-1.5-pro
```

- `META_ACCESS_TOKEN`: Used by `lib/meta-api-client.ts` for authenticated Graph API requests.
- `META_GRAPH_BASE_URL`: Optional override for Graph API version pinning or sandbox targets.
- `GEMINI_API_KEY`: Optional. If set, `lib/ai-orchestration.ts` requests preview text from Gemini.
- `GEMINI_MODEL`: Optional Gemini model name (defaults to `gemini-1.5-pro`).

## Architecture Modules

- `app/`
  - `app/page.tsx`: split-pane shell entry route.
  - `app/chat/page.tsx`: chat-focused route with right-pane context cards.
  - `app/analytics/page.tsx`: interactive KPI pane (range switch + bar visualization).
  - `app/api/agent/actions/route.ts`: validates and orchestrates assistant actions + draft proposals.
  - `app/api/action-cards/route.ts`: draft/preview/approve/reject/publish state transitions.
  - `app/api/meta/proxy/route.ts`: validates and proxies Meta Graph API calls.
- `components/`
  - `components/layout/split-pane-shell.tsx`: interactive chat composer + draft action cards.
  - `components/ui/*`: Shadcn-style baseline UI primitives (`Button`, `Card`).
- `lib/`
  - `lib/action-state.ts`: persistent action state model and approval token/hash checks.
  - `lib/action-cards.ts`: action-card view model helpers.
  - `lib/endpoints/publish.ts`: publish flow with mandatory budget validation.
  - `lib/policies/budget.ts`: hard limits + structured rejection errors.
  - `lib/meta-api-client.ts`: Graph API client with token auth + error handling.
  - `lib/ai-orchestration.ts`: action planning with optional Gemini preview generation.
  - `lib/validation.ts`: shared Zod schemas for API payload validation.

## Design Notes

- Dark theme is default (`<html className="dark">`) with Tailwind tokens configured in `app/globals.css` and `tailwind.config.ts`.
- Chat flow enforces approvals: the UI generates drafts, users must run Preview -> Approve -> Publish, and publish is blocked without a valid approval token + payload hash match.
- Budget policy is server-side only and runs before publish calls.
