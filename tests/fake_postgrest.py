"""In-memory stand-in for the Supabase REST (PostgREST) endpoints the store uses."""

import json

import httpx


class FakePostgrest:
    def __init__(self, fail_with_status: int | None = None):
        self.rows: dict[str, dict] = {}
        self.next_number = 0
        self.requests: list[httpx.Request] = []
        self.fail_with_status = fail_with_status

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.fail_with_status:
            return httpx.Response(self.fail_with_status, json={"message": "boom"})

        path = request.url.path
        params = request.url.params
        if path == "/rest/v1/rpc/next_dialogue_file_number" and request.method == "POST":
            self.next_number += 1
            return httpx.Response(200, json=self.next_number)
        if path != "/rest/v1/conversations":
            return httpx.Response(404, json={"message": f"unknown path {path}"})

        id_filter = params.get("id", "")
        row_id = id_filter.removeprefix("eq.") if id_filter.startswith("eq.") else None

        if request.method == "GET":
            if row_id:
                rows = [self.rows[row_id]] if row_id in self.rows else []
            else:
                rows = list(self.rows.values())
            if params.get("order") == "updated_at.desc":
                rows = sorted(rows, key=lambda row: row["updated_at"], reverse=True)
            columns = params.get("select", "*").split(",")
            return httpx.Response(200, json=[{column: row[column] for column in columns} for row in rows])

        if request.method == "POST":
            row = json.loads(request.content)
            self.rows[row["id"]] = row
            return httpx.Response(201)

        if request.method == "DELETE":
            deleted = self.rows.pop(row_id, None)
            return httpx.Response(200, json=[{"id": deleted["id"]}] if deleted else [])

        return httpx.Response(405)
