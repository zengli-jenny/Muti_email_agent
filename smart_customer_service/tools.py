from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class BusinessToolRegistry:
    def __init__(self, data_file: Path) -> None:
        self.data_file = data_file

    def call(self, name: str, payload: dict[str, Any]) -> dict[str, Any]:
        handler = getattr(self, name, None)
        if handler is None:
            return {"status": "error", "message": f"Unknown tool: {name}"}
        return handler(payload)

    def query_order(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = self._read()
        order_id = self._normalize_order_id(payload.get("order_id", ""))
        order = data["orders"].get(order_id)
        if not order:
            return {"status": "not_found", "order_id": order_id}
        response = {"status": "ok", "order_id": order_id, **order}
        if "status" in order:
            response["order_status"] = order["status"]
            response["status"] = "ok"
        return response

    def track_logistics(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = self._read()
        tracking_number = payload.get("tracking_number")
        if not tracking_number and payload.get("order_id"):
            order = data["orders"].get(self._normalize_order_id(payload["order_id"]))
            tracking_number = order.get("tracking_number") if order else None
        logistics = data["logistics"].get(tracking_number or "")
        if not logistics:
            return {"status": "not_found", "tracking_number": tracking_number}
        return {"status": "ok", "tracking_number": tracking_number, **logistics}

    def get_delivery_proof(self, payload: dict[str, Any]) -> dict[str, Any]:
        logistics = self.track_logistics(payload)
        if logistics["status"] != "ok":
            return logistics
        return {
            "status": "ok",
            "tracking_number": logistics["tracking_number"],
            "delivery_proof": logistics.get("delivery_proof", "No delivery proof available"),
        }

    def check_inventory(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = self._read()
        sku = payload.get("sku", "")
        inventory = data["inventory"].get(sku)
        if not inventory:
            return {"status": "not_found", "sku": sku}
        return {"status": "ok", "sku": sku, **inventory}

    def execute_refund(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = self._read()
        order_id = self._normalize_order_id(payload.get("order_id", ""))
        order = data["orders"].get(order_id)
        if not order:
            return {"status": "not_found", "order_id": order_id}
        order["refund_status"] = "processed"
        order["refund_reason"] = payload.get("reason", "customer_service_auto")
        data["orders"][order_id] = order
        self._write(data)
        return {
            "status": "ok",
            "order_id": order_id,
            "refund_amount": payload.get("amount", order.get("refund_amount")),
            "currency": order.get("currency", "USD"),
        }

    def create_exchange(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = self._read()
        order_id = self._normalize_order_id(payload.get("order_id", ""))
        order = data["orders"].get(order_id)
        if not order:
            return {"status": "not_found", "order_id": order_id}
        requested_sku = payload.get("new_sku", "")
        inventory = data["inventory"].get(requested_sku, {"available": 0})
        if inventory.get("available", 0) <= 0:
            return {"status": "out_of_stock", "order_id": order_id, "new_sku": requested_sku}
        order["exchange_status"] = "created"
        order["exchange_sku"] = requested_sku
        data["orders"][order_id] = order
        self._write(data)
        return {"status": "ok", "order_id": order_id, "new_sku": requested_sku}

    def _normalize_order_id(self, order_id: str) -> str:
        return order_id.replace("#", "").strip().upper()

    def _read(self) -> dict:
        return json.loads(self.data_file.read_text(encoding="utf-8"))

    def _write(self, payload: dict) -> None:
        self.data_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
