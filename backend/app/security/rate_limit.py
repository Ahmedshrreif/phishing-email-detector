from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings


class InMemoryRateLimiter(BaseHTTPMiddleware):
    """Small local rate limiter for login and analysis endpoints.

    Production deployments should place this behind a shared store such as Redis when running
    multiple backend replicas.
    """

    def __init__(self, app):
        super().__init__(app)
        self.buckets: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        settings = get_settings()
        path = request.url.path
        limit = None
        if path.startswith("/api/auth/login"):
            limit = settings.rate_limit_login_per_minute
        elif path.startswith("/api/analyze"):
            limit = settings.rate_limit_analysis_per_minute
        if limit:
            ip = request.client.host if request.client else "unknown"
            key = f"{ip}:{path}"
            now = time.time()
            bucket = self.buckets[key]
            while bucket and now - bucket[0] > 60:
                bucket.popleft()
            if len(bucket) >= limit:
                return Response("Rate limit exceeded", status_code=429)
            bucket.append(now)
        return await call_next(request)
