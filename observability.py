"""Structured observability primitives for agent and publish flows."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import re
from typing import Callable, Dict, List, Optional


SENSITIVE_KEY_PATTERN = re.compile(
    r"(access[_-]?token|auth[_-]?token|account[_-]?id|ad[_-]?id)", re.IGNORECASE
)
TOKEN_VALUE_PATTERN = re.compile(r"\bEA[A-Za-z0-9]{10,}\b")
NUMERIC_ID_PATTERN = re.compile(r"\b\d{7,}\b")


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def redact_value(value: str) -> str:
    """Redact high-risk values while retaining stable hashed references."""
    if not value:
        return value

    def _hash(raw: str) -> str:
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]

    value = TOKEN_VALUE_PATTERN.sub(lambda m: f"[REDACTED_TOKEN:{_hash(m.group(0))}]", value)
    value = NUMERIC_ID_PATTERN.sub(lambda m: f"[REDACTED_ID:{_hash(m.group(0))}]", value)
    return value


def redact_payload(payload: Dict[str, object]) -> Dict[str, object]:
    redacted: Dict[str, object] = {}
    for key, value in payload.items():
        if isinstance(value, dict):
            redacted[key] = redact_payload(value)
            continue
        if isinstance(value, list):
            redacted[key] = [redact_value(str(v)) for v in value]
            continue
        text = str(value)
        if SENSITIVE_KEY_PATTERN.search(key):
            redacted[key] = "[REDACTED]"
        else:
            redacted[key] = redact_value(text)
    return redacted


@dataclass
class MetricPoint:
    name: str
    value: float
    labels: Dict[str, str]
    at: str


class MetricsCollector:
    def __init__(self) -> None:
        self.counters: Dict[str, int] = {
            "draft_count": 0,
            "approval_total": 0,
            "approval_accepted": 0,
            "publish_attempts": 0,
            "publish_failures": 0,
            "blocked_by_policy": 0,
        }
        self.points: List[MetricPoint] = []

    def increment(self, name: str, amount: int = 1, **labels: str) -> None:
        self.counters[name] = self.counters.get(name, 0) + amount
        self.points.append(MetricPoint(name=name, value=amount, labels=labels, at=_timestamp()))

    def approval_rate(self) -> float:
        total = self.counters.get("approval_total", 0)
        if total == 0:
            return 0.0
        return self.counters.get("approval_accepted", 0) / total

    def snapshot(self) -> Dict[str, float]:
        return {
            **self.counters,
            "approval_rate": round(self.approval_rate(), 4),
        }


class AlertManager:
    def __init__(self, notifier: Optional[Callable[[str, Dict[str, object]], None]] = None) -> None:
        self.notifier = notifier or (lambda name, payload: None)
        self.failure_window: Dict[str, int] = {}

    def on_publish_result(self, session_id: str, success: bool, reason: str = "") -> None:
        if success:
            self.failure_window[session_id] = 0
            return
        current = self.failure_window.get(session_id, 0) + 1
        self.failure_window[session_id] = current
        if current >= 3:
            self.notifier(
                "repeated_publish_failures",
                {"session_id": session_id, "failures": current, "reason": reason},
            )

    def on_policy_bypass_attempt(self, session_id: str, policy: str, actor: str) -> None:
        self.notifier(
            "policy_bypass_attempt",
            {"session_id": session_id, "policy": policy, "actor": actor},
        )


class StructuredLogger:
    def __init__(self, sink: Optional[Callable[[str], None]] = None) -> None:
        self._sink = sink or print
        self.events: List[Dict[str, object]] = []

    def emit(self, event_type: str, session_id: str, **payload: object) -> None:
        event = {
            "timestamp": _timestamp(),
            "event_type": event_type,
            "session_id": session_id,
            **redact_payload({k: v for k, v in payload.items()}),
        }
        self.events.append(event)
        self._sink(json.dumps(event, sort_keys=True))


class MetaAdsService:
    """Agent + publish flow with end-to-end structured observability."""

    def __init__(self, logger: StructuredLogger, metrics: MetricsCollector, alerts: AlertManager) -> None:
        self.logger = logger
        self.metrics = metrics
        self.alerts = alerts

    def draft(self, session_id: str, prompt_intent: str, selected_tool: str, policy_decision: str) -> None:
        self.metrics.increment("draft_count")
        if policy_decision == "blocked":
            self.metrics.increment("blocked_by_policy")
        self.logger.emit(
            "agent.draft",
            session_id=session_id,
            prompt_intent=prompt_intent,
            selected_tool=selected_tool,
            policy_decision=policy_decision,
        )

    def approval(self, session_id: str, approved: bool) -> None:
        self.metrics.increment("approval_total")
        if approved:
            self.metrics.increment("approval_accepted")
        self.logger.emit("agent.approval", session_id=session_id, approved=approved)

    def publish(
        self,
        session_id: str,
        policy_decision: str,
        meta_status: str,
        response_code: int,
        actor: str = "system",
        access_token: str = "",
        account_id: str = "",
    ) -> bool:
        self.metrics.increment("publish_attempts")
        success = meta_status == "success" and 200 <= response_code < 300

        if policy_decision == "blocked":
            self.metrics.increment("blocked_by_policy")
            self.alerts.on_policy_bypass_attempt(session_id=session_id, policy="publish_guard", actor=actor)

        if not success:
            self.metrics.increment("publish_failures")

        self.logger.emit(
            "publish.result",
            session_id=session_id,
            policy_decision=policy_decision,
            meta_response_status=meta_status,
            response_code=response_code,
            access_token=access_token,
            account_id=account_id,
        )

        self.alerts.on_publish_result(
            session_id=session_id,
            success=success,
            reason=f"status={meta_status},code={response_code}",
        )
        return success


def trace_session(events: List[Dict[str, object]], session_id: str) -> List[Dict[str, object]]:
    """Minimal admin/debug trace query for a single session."""
    return [e for e in events if e.get("session_id") == session_id]
