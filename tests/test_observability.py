import json
import unittest

from observability import AlertManager, MetaAdsService, MetricsCollector, StructuredLogger, trace_session


class ObservabilityTests(unittest.TestCase):
    def test_structured_logging_and_metrics(self):
        out = []
        logger = StructuredLogger(sink=out.append)
        metrics = MetricsCollector()
        alerts = []
        service = MetaAdsService(
            logger=logger,
            metrics=metrics,
            alerts=AlertManager(notifier=lambda name, payload: alerts.append((name, payload))),
        )

        service.draft("s1", "create prospecting ad", "campaign_builder", "allow")
        service.approval("s1", True)
        ok = service.publish(
            "s1",
            policy_decision="allow",
            meta_status="success",
            response_code=200,
            access_token="EAabcdef1234567890",
            account_id="1234567890123",
        )
        self.assertTrue(ok)

        self.assertEqual(metrics.snapshot()["draft_count"], 1)
        self.assertEqual(metrics.snapshot()["publish_attempts"], 1)
        self.assertEqual(metrics.snapshot()["publish_failures"], 0)
        self.assertEqual(metrics.snapshot()["approval_rate"], 1.0)

        publish_event = [json.loads(line) for line in out if 'publish.result' in line][0]
        self.assertEqual(publish_event["access_token"], "[REDACTED]")
        self.assertEqual(publish_event["account_id"], "[REDACTED]")

        trace = trace_session(logger.events, "s1")
        self.assertEqual(len(trace), 3)
        self.assertEqual(alerts, [])

    def test_alert_hooks_for_failures_and_policy_bypass(self):
        logger = StructuredLogger(sink=lambda _: None)
        metrics = MetricsCollector()
        alerts = []
        service = MetaAdsService(
            logger=logger,
            metrics=metrics,
            alerts=AlertManager(notifier=lambda name, payload: alerts.append((name, payload))),
        )

        for _ in range(3):
            service.publish(
                "s2",
                policy_decision="allow",
                meta_status="error",
                response_code=500,
            )

        service.publish(
            "s3",
            policy_decision="blocked",
            meta_status="error",
            response_code=403,
            actor="operator",
        )

        alert_names = [a[0] for a in alerts]
        self.assertIn("repeated_publish_failures", alert_names)
        self.assertIn("policy_bypass_attempt", alert_names)
        self.assertGreaterEqual(metrics.snapshot()["publish_failures"], 4)
        self.assertGreaterEqual(metrics.snapshot()["blocked_by_policy"], 1)


if __name__ == "__main__":
    unittest.main()
