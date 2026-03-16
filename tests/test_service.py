from __future__ import annotations

import json
import shutil
import unittest
from pathlib import Path

from smart_customer_service.service import CustomerServiceApp


class CustomerServiceAppTests(unittest.TestCase):
    def setUp(self) -> None:
        source_root = Path(__file__).resolve().parent.parent
        self.root = source_root / "tests" / "_sandbox"
        if self.root.exists():
            shutil.rmtree(self.root)
        self.root.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source_root / "data", self.root / "data")
        shutil.copytree(source_root / "skills", self.root / "skills")
        self.app = CustomerServiceApp(base_dir=self.root)

    def tearDown(self) -> None:
        if self.root.exists():
            shutil.rmtree(self.root)

    def test_delivery_issue_triggers_logistics_and_refund_plan(self) -> None:
        response = self.app.handle_request(
            {
                "customer_email": "alice@example.com",
                "brand": "ohuhu",
                "subject": "Package issue",
                "body": "Hi, order #OHU290027 shows delivered but I did not receive it. I can also accept a refund.",
                "auto_execute": False,
            }
        )

        intent_types = [item["intent_type"] for item in response["intents"]]
        self.assertIn("logistics", intent_types)
        self.assertIn("refund", intent_types)
        self.assertIn("OHU290027", response["final_reply"])
        self.assertTrue(any(call["name"] == "track_logistics" for call in response["tool_calls"]))

    def test_auto_execute_small_refund(self) -> None:
        response = self.app.handle_request(
            {
                "customer_email": "alice@example.com",
                "brand": "ohuhu",
                "subject": "Refund request",
                "body": "Please refund order #OHU290027.",
                "auto_execute": True,
            }
        )

        statuses = [action["status"] for action in response["actions"] if action["action_type"] == "refund"]
        self.assertIn("executed", statuses)
        business_data = json.loads((self.root / "data" / "business_data.json").read_text(encoding="utf-8"))
        self.assertEqual(business_data["orders"]["OHU290027"]["refund_status"], "processed")

    def test_graph_retrieval_for_compatibility(self) -> None:
        response = self.app.handle_request(
            {
                "customer_email": "artist@example.com",
                "brand": "ohuhu",
                "subject": "Nib compatibility",
                "body": "Which replacement nib works with the Ohuhu Marker Set 48?",
                "auto_execute": False,
            }
        )

        sources = [item["source"] for item in response["retrieved_items"]]
        self.assertIn("graph", sources)
        self.assertIn("Brush Replacement Nib Pack", response["final_reply"])


if __name__ == "__main__":
    unittest.main()
