import uuid
from dataclasses import dataclass

from django.db import models
from django.utils import timezone

from apps.core.models.audit import BaseModel
from apps.tenancy.models import Tenant


class SyncEntityRegistry(BaseModel):
    class SyncClass(models.TextChoices):
        REFERENCE = "R", "Reference"
        DOCUMENT = "D", "Document"
        TRANSACTIONAL = "T", "Transactional"
        APPEND_ONLY = "A", "Append-only"
        SETTINGS = "S", "Settings"

    class MergeStrategy(models.TextChoices):
        SERVER_WINS = "server_wins", "Server wins"
        LWW = "lww", "Last-write-wins"
        THREE_WAY = "3way", "Three-way merge"
        MANUAL = "manual", "Manual review"

    entity_type = models.CharField(max_length=64, unique=True, db_index=True)
    sync_class = models.CharField(max_length=1, choices=SyncClass.choices)
    merge_strategy = models.CharField(max_length=16, choices=MergeStrategy.choices, default=MergeStrategy.LWW)
    direction = models.CharField(max_length=16, default="bidirectional")
    enabled = models.BooleanField(default=True)

    class Meta:
        db_table = "sync_entity_registry"


class SyncedRecord(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="synced_records")
    entity_type = models.CharField(max_length=64, db_index=True)
    entity_id = models.CharField(max_length=64, db_index=True)
    payload = models.JSONField(default=dict)
    hlc_wall_ms = models.BigIntegerField(default=0)
    hlc_logical = models.BigIntegerField(default=0)
    hlc_node_id = models.CharField(max_length=64, default="server")
    is_deleted = models.BooleanField(default=False)

    class Meta:
        db_table = "sync_replica"
        unique_together = [("tenant", "entity_type", "entity_id")]
        indexes = [
            models.Index(fields=["tenant", "entity_type", "hlc_wall_ms", "hlc_logical"]),
        ]


class SyncInbox(BaseModel):
    class Status(models.TextChoices):
        APPLIED = "APPLIED", "Applied"
        CONFLICT = "CONFLICT", "Conflict"
        REJECTED = "REJECTED", "Rejected"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="sync_inbox")
    device_id = models.CharField(max_length=128, db_index=True)
    client_op_id = models.CharField(max_length=64, db_index=True)
    entity_type = models.CharField(max_length=64)
    entity_id = models.CharField(max_length=64, blank=True, default="")
    operation = models.CharField(max_length=16)
    result_status = models.CharField(max_length=16, choices=Status.choices)
    result_payload = models.JSONField(default=dict)
    conflict_code = models.CharField(max_length=16, blank=True, default="")

    class Meta:
        db_table = "sync_inbox"
        unique_together = [("tenant", "device_id", "client_op_id")]
        indexes = [models.Index(fields=["tenant", "created_at"])]


class SyncOutbox(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="sync_outbox")
    event_type = models.CharField(max_length=64, db_index=True)
    entity_type = models.CharField(max_length=64)
    entity_id = models.CharField(max_length=64)
    payload = models.JSONField(default=dict)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "sync_outbox"
        indexes = [models.Index(fields=["tenant", "created_at"])]


class SyncDeviceCursor(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="sync_cursors")
    device_id = models.CharField(max_length=128)
    entity_type = models.CharField(max_length=64)
    cursor_wall_ms = models.BigIntegerField(default=0)
    cursor_logical = models.BigIntegerField(default=0)
    cursor_entity_id = models.CharField(max_length=64, blank=True, default="")
    cursor_signature = models.CharField(max_length=128, blank=True, default="")
    last_sync_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "sync_device_cursor"
        unique_together = [("tenant", "device_id", "entity_type")]


class SyncConflict(BaseModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="sync_conflicts")
    entity_type = models.CharField(max_length=64)
    entity_id = models.CharField(max_length=64)
    conflict_code = models.CharField(max_length=16, db_index=True)
    client_payload = models.JSONField(default=dict)
    server_payload = models.JSONField(default=dict)
    resolution = models.CharField(max_length=32, blank=True, default="pending")
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "sync_conflict"
        indexes = [models.Index(fields=["tenant", "resolution", "created_at"])]


SYNC_SCHEMA_VERSION = 1


@dataclass(frozen=True)
class HLC:
    wall_ms: int
    logical: int
    node_id: str

    def as_dict(self) -> dict:
        return {"wall_ms": self.wall_ms, "logical": self.logical, "node_id": self.node_id}

    def compare(self, other: "HLC") -> int:
        if self.wall_ms != other.wall_ms:
            return 1 if self.wall_ms > other.wall_ms else -1
        if self.logical != other.logical:
            return 1 if self.logical > other.logical else -1
        if self.node_id == other.node_id:
            return 0
        return 1 if self.node_id > other.node_id else -1


def hlc_from_dict(data: dict | None) -> HLC:
    data = data or {}
    return HLC(
        wall_ms=int(data.get("wall_ms") or 0),
        logical=int(data.get("logical") or 0),
        node_id=str(data.get("node_id") or "unknown"),
    )


def server_hlc_now() -> HLC:
    import time

    return HLC(wall_ms=int(time.time() * 1000), logical=0, node_id="server")
