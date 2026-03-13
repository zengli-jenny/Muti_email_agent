"""
新版多专家 Agent 系统的 HTTP 服务入口
"""
from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from smart_customer_service.multi_agent_service import MultiAgentCustomerService


class MultiAgentRequestHandler(BaseHTTPRequestHandler):
    """多专家 Agent 系统的 HTTP 请求处理器"""

    app = MultiAgentCustomerService()

    def do_GET(self) -> None:
        """处理 GET 请求"""
        if self.path == "/health":
            self._send_json({"status": "ok"})
        elif self.path == "/info":
            self._send_json(self.app.get_system_info())
        else:
            self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        """处理 POST 请求"""
        if self.path != "/reply":
            self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)

        try:
            payload = json.loads(raw_body.decode("utf-8"))
            response = self.app.handle_request(payload)
        except Exception as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        self._send_json(response)

    def log_message(self, format: str, *args: object) -> None:
        """禁用默认日志输出"""
        return

    def _send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        """发送 JSON 响应"""
        data = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    """启动多专家 Agent 客服系统"""
    server = ThreadingHTTPServer(("127.0.0.1", 8000), MultiAgentRequestHandler)
    print("=" * 60)
    print("Multi-Agent Customer Service System v2.0")
    print("=" * 60)
    print("Architecture: Coordinator + Router + 15 Expert Agents")
    print("Listening on: http://127.0.0.1:8000")
    print("=" * 60)
    print("\nEndpoints:")
    print("  GET  /health  - Health check")
    print("  GET  /info    - System information")
    print("  POST /reply   - Process customer email")
    print("\nPress Ctrl+C to stop")
    print("=" * 60)
    server.serve_forever()


if __name__ == "__main__":
    main()
