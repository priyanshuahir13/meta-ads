# Observability Debug Guide

This repository now emits structured JSON logs for both agent-draft and publish flows.

## Event schema

Each log includes:

- `timestamp`
- `event_type` (`agent.draft`, `agent.approval`, `publish.result`)
- `session_id`
- flow fields such as `prompt_intent`, `selected_tool`, `policy_decision`, and `meta_response_status`

Sensitive values are redacted:

- Keys matching `access_token`, `auth_token`, `account_id`, `ad_id`
- Token-like values (`EA...`)
- Long numeric identifiers (7+ digits)

## Session trace query

If logs are written to `logs.jsonl`, run:

```bash
jq -c 'select(.session_id == "<SESSION_ID>")' logs.jsonl
```

Useful checks:

```bash
jq -c 'select(.event_type == "publish.result" and .meta_response_status != "success")' logs.jsonl
jq -c 'select(.policy_decision == "blocked")' logs.jsonl
```

## Metrics to export

The in-process collector reports:

- `draft_count`
- `approval_rate`
- `publish_attempts`
- `publish_failures`
- `blocked_by_policy`

## Alert hooks

Two hooks are available:

1. `repeated_publish_failures` after 3 consecutive failed publish attempts in a session.
2. `policy_bypass_attempt` when a blocked policy decision still reaches publish flow.

Connect these hooks to PagerDuty/Slack/Webhooks by passing a custom notifier into `AlertManager`.
