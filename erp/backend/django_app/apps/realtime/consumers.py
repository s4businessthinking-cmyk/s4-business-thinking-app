"""WebSocket consumer (STAGE 11, ERP_ARCHITECTURE §13).

Auth is ticket-based (never the JWT). On connect the connection binds to
(tenant, user, device) and auto-joins its self-scoped groups. Clients may then
subscribe to permission-checked groups, receive replayed missed events, and
exchange heartbeats for presence.
"""
import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone

from apps.realtime.services.groups import (
    base_groups_for,
    channel_group_name,
    is_self_scoped_group,
)
from apps.realtime.services.presence import mark_offline, mark_online
from apps.realtime.services.replay import read_since
from apps.realtime.services.tickets import consume_ticket

logger = logging.getLogger(__name__)

CLOSE_INVALID_TICKET = 4401
CLOSE_INTERNAL = 4500


class RealtimeConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        token = self._ticket_from_scope()
        ticket = await database_sync_to_async(consume_ticket)(token)
        if not ticket:
            await self.close(code=CLOSE_INVALID_TICKET)
            return

        self.tenant_id = str(ticket["tenant_id"])
        self.user_id = str(ticket["user_id"])
        self.device_id = str(ticket.get("device_id") or "")
        self.email = ticket.get("email") or ""
        self.joined: set[str] = set()

        for logical in base_groups_for(self.tenant_id, self.user_id, self.device_id):
            await self._join(logical)

        await self.accept()
        await database_sync_to_async(mark_online)(self.tenant_id, self.user_id, self.device_id)
        await database_sync_to_async(self._audit)("REALTIME_WS_CONNECT")
        await self.send_json(
            {
                "type": "connection.ready",
                "tenant_id": self.tenant_id,
                "user_id": self.user_id,
                "device_id": self.device_id,
                "groups": sorted(self.joined),
                "ts": timezone.now().isoformat(),
            }
        )

    async def disconnect(self, code):
        for logical in list(getattr(self, "joined", set())):
            await self.channel_layer.group_discard(
                channel_group_name(self.tenant_id, logical), self.channel_name
            )
        if getattr(self, "tenant_id", None):
            await database_sync_to_async(mark_offline)(self.tenant_id, self.user_id, self.device_id)
            await database_sync_to_async(self._audit)("REALTIME_WS_DISCONNECT")

    async def receive_json(self, content, **kwargs):
        action = (content or {}).get("action")
        if action == "subscribe":
            await self._handle_subscribe(content)
        elif action == "unsubscribe":
            await self._handle_unsubscribe(content)
        elif action == "ping":
            await database_sync_to_async(mark_online)(self.tenant_id, self.user_id, self.device_id)
            await self.send_json({"type": "pong", "ts": timezone.now().isoformat()})
        elif action == "ack":
            await self.send_json({"type": "ack.ok", "group": content.get("group", "")})
        else:
            await self.send_json(
                {"type": "error", "code": "UNKNOWN_ACTION", "message": f"Unknown action: {action}"}
            )

    # -- channel layer event handler -------------------------------------
    async def realtime_event(self, event):
        await self.send_json(event["envelope"])

    # -- internals -------------------------------------------------------
    def _ticket_from_scope(self) -> str:
        qs = parse_qs((self.scope.get("query_string") or b"").decode("utf-8"))
        values = qs.get("ticket") or qs.get("t") or []
        return values[0] if values else ""

    async def _join(self, logical_group: str):
        await self.channel_layer.group_add(
            channel_group_name(self.tenant_id, logical_group), self.channel_name
        )
        self.joined.add(logical_group)

    async def _handle_subscribe(self, content):
        logical = str(content.get("group") or "").strip()
        if not logical:
            await self.send_json({"type": "error", "code": "BAD_GROUP", "message": "group required"})
            return

        allowed = is_self_scoped_group(logical, self.user_id, self.device_id)
        if not allowed:
            allowed = await database_sync_to_async(self._can_subscribe)(logical)
        if not allowed:
            await self.send_json(
                {"type": "error", "code": "SUBSCRIBE_DENIED", "message": f"Not allowed: {logical}"}
            )
            return

        await self._join(logical)

        last_event_id = int(content.get("last_event_id") or 0)
        missed = await database_sync_to_async(read_since)(self.tenant_id, logical, last_event_id)
        for env in missed:
            await self.send_json(env)

        await self.send_json(
            {"type": "subscribed", "group": logical, "replayed": len(missed)}
        )

    async def _handle_unsubscribe(self, content):
        logical = str(content.get("group") or "").strip()
        if logical in self.joined:
            await self.channel_layer.group_discard(
                channel_group_name(self.tenant_id, logical), self.channel_name
            )
            self.joined.discard(logical)
        await self.send_json({"type": "unsubscribed", "group": logical})

    def _can_subscribe(self, logical_group: str) -> bool:
        """Tenant-wide / resource / report groups require realtime.subscribe."""
        gated_prefixes = ("tenant", "branch:", "resource:", "report:")
        if not (logical_group == "tenant" or logical_group.startswith(gated_prefixes)):
            return False
        from apps.identity.models import User
        from apps.rbac.services.permissions import user_has_permission

        user = User.objects.filter(id=self.user_id).first()
        if not user:
            return False
        return user_has_permission(user, "realtime.subscribe")

    def _audit(self, action: str):
        from apps.core.models import AuditLogEntry
        from apps.core.services.audit import write_audit_log

        try:
            write_audit_log(
                category=AuditLogEntry.Category.SYSTEM,
                action=action,
                actor_id=self.user_id,
                payload={
                    "tenant_id": self.tenant_id,
                    "device_id": self.device_id,
                    "email": self.email,
                },
            )
        except Exception:  # pragma: no cover - audit is best-effort
            logger.exception("realtime audit write failed action=%s", action)
