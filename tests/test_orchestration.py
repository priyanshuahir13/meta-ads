from __future__ import annotations

from dataclasses import dataclass

from meta_ads.orchestration import (
    AdCreationOrchestrator,
    ErrorCategory,
    RetryPolicy,
    TypedMetaEndpoints,
)


@dataclass
class ApiExc(Exception):
    response: dict


class FakeClient:
    def __init__(self, scenarios: dict[str, list[dict]]):
        self.scenarios = scenarios
        self.headers_seen: list[dict[str, str]] = []

    def post(self, path: str, payload: dict, headers: dict[str, str]) -> dict:
        self.headers_seen.append(headers)
        actions = self.scenarios.get(path, [{"ok": {"id": "default"}}])
        action = actions.pop(0)
        if "raise" in action:
            raise ApiExc(action["raise"])
        return action["ok"]


def test_successful_hierarchy_creation_propagates_correlation_id():
    client = FakeClient(
        {
            "/campaigns": [{"ok": {"id": "c1"}}],
            "/adsets": [{"ok": {"id": "s1"}}],
            "/adcreatives": [{"ok": {"id": "cr1"}}],
            "/ads": [{"ok": {"id": "a1"}}],
        }
    )
    orch = AdCreationOrchestrator(TypedMetaEndpoints(client), sleeper=lambda _: None)

    result = orch.create_hierarchy({}, {}, {}, {}, correlation_id="corr-123")

    assert result.success is True
    assert "corr-123" in result.user_summary
    assert all(h["X-Correlation-ID"] == "corr-123" for h in client.headers_seen)


def test_partial_failure_triggers_cleanup_and_summary():
    client = FakeClient(
        {
            "/campaigns": [{"ok": {"id": "c1"}}],
            "/adsets": [{"ok": {"id": "s1"}}],
            "/adcreatives": [{"raise": {"error": {"code": 100, "message": "invalid creative"}}}],
            "/ad_set/s1": [{"ok": {"id": "s1"}}],
            "/campaign/c1": [{"raise": {"error": {"code": 100, "message": "cannot archive"}}}],
        }
    )
    orch = AdCreationOrchestrator(TypedMetaEndpoints(client), sleeper=lambda _: None)

    result = orch.create_hierarchy({}, {}, {}, {}, correlation_id="corr-fail")

    assert result.success is False
    assert "partially failed" in result.user_summary
    assert "Manual cleanup required" in result.user_summary
    assert any(c.success for c in result.cleanups)
    assert any(not c.success for c in result.cleanups)


def test_rate_limit_retries_then_succeeds():
    client = FakeClient(
        {
            "/campaigns": [
                {"raise": {"error": {"code": 613, "message": "rate limited"}}},
                {"ok": {"id": "c1"}},
            ],
            "/adsets": [{"ok": {"id": "s1"}}],
            "/adcreatives": [{"ok": {"id": "cr1"}}],
            "/ads": [{"ok": {"id": "a1"}}],
        }
    )
    sleeps: list[float] = []
    orch = AdCreationOrchestrator(
        TypedMetaEndpoints(client),
        retry_policy=RetryPolicy(max_attempts=3, base_delay_seconds=0.1),
        sleeper=lambda t: sleeps.append(t),
    )

    result = orch.create_hierarchy({}, {}, {}, {})

    assert result.success is True
    assert sleeps


def test_validation_error_is_not_retried():
    client = FakeClient(
        {
            "/campaigns": [{"raise": {"error": {"code": 100, "message": "invalid"}}}],
        }
    )
    sleeps: list[float] = []
    orch = AdCreationOrchestrator(TypedMetaEndpoints(client), sleeper=lambda t: sleeps.append(t))

    result = orch.create_hierarchy({}, {}, {}, {})

    assert result.success is False
    assert result.steps[0].error is not None
    assert result.steps[0].error.category == ErrorCategory.VALIDATION
    assert sleeps == []
