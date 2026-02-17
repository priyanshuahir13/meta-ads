from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import time
from typing import Any, Callable, Protocol
from uuid import uuid4


class ErrorCategory(str, Enum):
    TRANSIENT = "transient"
    RATE_LIMIT = "rate_limit"
    AUTH = "auth"
    VALIDATION = "validation"
    PERMANENT = "permanent"
    UNKNOWN = "unknown"


@dataclass(slots=True)
class MetaApiError(Exception):
    """Standardized error surfaced by typed endpoint wrappers."""

    category: ErrorCategory
    message: str
    code: int | None = None
    response: dict[str, Any] | None = None

    def __str__(self) -> str:
        return f"{self.category}: {self.message}"


@dataclass(slots=True)
class RetryPolicy:
    max_attempts: int = 4
    base_delay_seconds: float = 0.25
    max_delay_seconds: float = 3.0

    def compute_delay(self, attempt: int, error: MetaApiError) -> float:
        if error.category == ErrorCategory.RATE_LIMIT:
            return min(self.max_delay_seconds, self.base_delay_seconds * (2**attempt) + 1.0)
        return min(self.max_delay_seconds, self.base_delay_seconds * (2**attempt))


@dataclass(slots=True)
class ResourceRef:
    resource_type: str
    resource_id: str


@dataclass(slots=True)
class StepReport:
    name: str
    success: bool
    resource: ResourceRef | None = None
    error: MetaApiError | None = None


@dataclass(slots=True)
class CleanupReport:
    resource: ResourceRef
    action: str
    success: bool
    error: str | None = None


@dataclass(slots=True)
class OrchestrationResult:
    correlation_id: str
    success: bool
    steps: list[StepReport] = field(default_factory=list)
    cleanups: list[CleanupReport] = field(default_factory=list)
    user_summary: str = ""


class MetaHttpClient(Protocol):
    def post(self, path: str, payload: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]: ...


class TypedMetaEndpoints:
    """Thin typed wrappers around Meta endpoints with standardized error mapping."""

    def __init__(self, client: MetaHttpClient):
        self.client = client

    def create_campaign(self, payload: dict[str, Any], *, correlation_id: str) -> ResourceRef:
        data = self._post("/campaigns", payload, correlation_id)
        return ResourceRef("campaign", str(data["id"]))

    def create_ad_set(self, payload: dict[str, Any], *, correlation_id: str) -> ResourceRef:
        data = self._post("/adsets", payload, correlation_id)
        return ResourceRef("ad_set", str(data["id"]))

    def create_creative(self, payload: dict[str, Any], *, correlation_id: str) -> ResourceRef:
        data = self._post("/adcreatives", payload, correlation_id)
        return ResourceRef("creative", str(data["id"]))

    def create_ad(self, payload: dict[str, Any], *, correlation_id: str) -> ResourceRef:
        data = self._post("/ads", payload, correlation_id)
        return ResourceRef("ad", str(data["id"]))

    def pause_or_archive(self, ref: ResourceRef, *, correlation_id: str) -> None:
        payload = {"id": ref.resource_id, "status": "PAUSED", "archived": True}
        self._post(f"/{ref.resource_type}/{ref.resource_id}", payload, correlation_id)

    def _post(self, path: str, payload: dict[str, Any], correlation_id: str) -> dict[str, Any]:
        try:
            return self.client.post(path, payload, headers={"X-Correlation-ID": correlation_id})
        except Exception as exc:  # mapped to stable error format
            raise map_meta_error(exc) from exc


TRANSIENT_CODES = {1, 2, 4, 17, 341}
RATE_LIMIT_CODES = {4, 17, 32, 613}
AUTH_CODES = {10, 190}
VALIDATION_CODES = {100, 1487390}


def map_meta_error(exc: Exception) -> MetaApiError:
    """Normalize different exception shapes into a typed MetaApiError."""

    response = getattr(exc, "response", None)
    if isinstance(response, dict):
        code = response.get("error", {}).get("code") or response.get("code")
        message = response.get("error", {}).get("message") or response.get("message") or str(exc)
    else:
        code = getattr(exc, "code", None)
        message = str(exc)
        response = None

    if code in RATE_LIMIT_CODES:
        category = ErrorCategory.RATE_LIMIT
    elif code in TRANSIENT_CODES:
        category = ErrorCategory.TRANSIENT
    elif code in AUTH_CODES:
        category = ErrorCategory.AUTH
    elif code in VALIDATION_CODES:
        category = ErrorCategory.VALIDATION
    elif code is None:
        category = ErrorCategory.UNKNOWN
    else:
        category = ErrorCategory.PERMANENT

    return MetaApiError(category=category, message=message, code=code, response=response)


class AdCreationOrchestrator:
    def __init__(
        self,
        endpoints: TypedMetaEndpoints,
        retry_policy: RetryPolicy | None = None,
        sleeper: Callable[[float], None] = time.sleep,
    ):
        self.endpoints = endpoints
        self.retry_policy = retry_policy or RetryPolicy()
        self.sleeper = sleeper

    def create_hierarchy(
        self,
        campaign_payload: dict[str, Any],
        ad_set_payload: dict[str, Any],
        creative_payload: dict[str, Any],
        ad_payload: dict[str, Any],
        *,
        correlation_id: str | None = None,
    ) -> OrchestrationResult:
        cid = correlation_id or str(uuid4())
        result = OrchestrationResult(correlation_id=cid, success=False)
        created: list[ResourceRef] = []

        plan: list[tuple[str, Callable[[], ResourceRef]]] = [
            ("campaign", lambda: self._with_retry(lambda: self.endpoints.create_campaign(campaign_payload, correlation_id=cid))),
            ("ad_set", lambda: self._with_retry(lambda: self.endpoints.create_ad_set(ad_set_payload, correlation_id=cid))),
            ("creative", lambda: self._with_retry(lambda: self.endpoints.create_creative(creative_payload, correlation_id=cid))),
            ("ad", lambda: self._with_retry(lambda: self.endpoints.create_ad(ad_payload, correlation_id=cid))),
        ]

        for step_name, fn in plan:
            try:
                ref = fn()
                created.append(ref)
                result.steps.append(StepReport(name=step_name, success=True, resource=ref))
            except MetaApiError as err:
                result.steps.append(StepReport(name=step_name, success=False, error=err))
                result.cleanups.extend(self._cleanup(created, cid))
                result.user_summary = self._build_partial_failure_summary(result)
                return result

        result.success = True
        result.user_summary = (
            f"✅ Campaign->Ad Set->Creative->Ad creation completed successfully. "
            f"Correlation ID: {cid}."
        )
        return result

    def _with_retry(self, fn: Callable[[], ResourceRef]) -> ResourceRef:
        attempt = 0
        while True:
            try:
                return fn()
            except MetaApiError as err:
                attempt += 1
                if attempt >= self.retry_policy.max_attempts or err.category not in {
                    ErrorCategory.TRANSIENT,
                    ErrorCategory.RATE_LIMIT,
                    ErrorCategory.UNKNOWN,
                }:
                    raise
                self.sleeper(self.retry_policy.compute_delay(attempt, err))

    def _cleanup(self, created: list[ResourceRef], correlation_id: str) -> list[CleanupReport]:
        reports: list[CleanupReport] = []
        for ref in reversed(created):
            try:
                self._with_retry(lambda: self._cleanup_call(ref, correlation_id))
                reports.append(CleanupReport(resource=ref, action="pause/archive", success=True))
            except MetaApiError as err:
                reports.append(
                    CleanupReport(
                        resource=ref,
                        action="manual-cleanup-required",
                        success=False,
                        error=f"{err.category}:{err.message}",
                    )
                )
        return reports

    def _cleanup_call(self, ref: ResourceRef, correlation_id: str) -> ResourceRef:
        self.endpoints.pause_or_archive(ref, correlation_id=correlation_id)
        return ref

    def _build_partial_failure_summary(self, result: OrchestrationResult) -> str:
        failed = next((s for s in result.steps if not s.success), None)
        if failed is None:
            return "Unknown orchestration state."

        cleanup_success = [c for c in result.cleanups if c.success]
        cleanup_failed = [c for c in result.cleanups if not c.success]
        lines = [
            "⚠️ Multi-step ad creation partially failed.",
            f"Correlation ID: {result.correlation_id}",
            f"Failed step: {failed.name}",
        ]
        if failed.error:
            lines.append(f"Reason: {failed.error.category} ({failed.error.message})")
        if cleanup_success:
            lines.append(
                "Auto-cleanup completed for: " + ", ".join(f"{c.resource.resource_type}:{c.resource.resource_id}" for c in cleanup_success)
            )
        if cleanup_failed:
            lines.append(
                "Manual cleanup required for: " + ", ".join(f"{c.resource.resource_type}:{c.resource.resource_id}" for c in cleanup_failed)
            )
        return "\n".join(lines)
