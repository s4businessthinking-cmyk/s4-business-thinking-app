from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.customization.models import CustomFieldDef, NumberSequence
from apps.customization.serializers import (
    FieldDefCreateSerializer,
    FieldDefSerializer,
    FieldValueSerializer,
    SequenceCreateSerializer,
    SequenceNextSerializer,
    SequenceSerializer,
    SetValueSerializer,
)
from apps.customization.services import fields, sequences
from apps.rbac.services.permissions import user_has_permission
from apps.tenancy.services.resolver import (
    TenancyError,
    resolve_tenant_for_user,
    set_request_tenant,
)


def _resolve_tenant(request):
    tenant_id = request.META.get("HTTP_X_TENANT_ID")
    tenant_slug = request.META.get("HTTP_X_TENANT_SLUG")
    tenant = resolve_tenant_for_user(user=request.user, tenant_id=tenant_id, tenant_slug=tenant_slug)
    set_request_tenant(request, tenant)
    return tenant


def _tenant_error(exc):
    return Response({"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status)


def _require_perm(request, code: str):
    if not user_has_permission(request.user, code):
        return Response(
            {"success": False, "error": {"code": "PERMISSION_DENIED", "message": f"Missing permission: {code}"}},
            status=403,
        )
    return None


class FieldDefView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "customization.read")
        if denied:
            return denied
        qs = CustomFieldDef.objects.filter(tenant=tenant)
        entity_type = request.query_params.get("entity_type")
        if entity_type:
            qs = qs.filter(entity_type=entity_type)
        return Response({"success": True, "fields": FieldDefSerializer(qs, many=True).data})

    def post(self, request):
        serializer = FieldDefCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "customization.manage")
        if denied:
            return denied
        data = serializer.validated_data
        if CustomFieldDef.objects.filter(
            tenant=tenant, entity_type=data["entity_type"], code=data["code"]
        ).exists():
            return Response(
                {"success": False, "error": {"code": "DUPLICATE_FIELD", "message": "Field code exists for entity"}},
                status=409,
            )
        field = CustomFieldDef.objects.create(
            tenant=tenant,
            entity_type=data["entity_type"],
            code=data["code"],
            label=data["label"],
            field_type=data.get("field_type"),
            options=data.get("options") or [],
            required=data.get("required", False),
            sort_order=data.get("sort_order", 0),
        )
        return Response({"success": True, "field": FieldDefSerializer(field).data}, status=201)


class FieldValueView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "customization.read")
        if denied:
            return denied
        entity_type = request.query_params.get("entity_type", "")
        entity_id = request.query_params.get("entity_id", "")
        values = fields.get_values(tenant=tenant, entity_type=entity_type, entity_id=entity_id)
        return Response({"success": True, "values": FieldValueSerializer(values, many=True).data})

    def post(self, request):
        serializer = SetValueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "customization.manage")
        if denied:
            return denied
        try:
            value = fields.set_value(
                tenant=tenant,
                field_id=serializer.validated_data["field_id"],
                entity_id=serializer.validated_data["entity_id"],
                value=serializer.validated_data.get("value", ""),
            )
        except fields.CustomizationError as exc:
            return Response(
                {"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status
            )
        return Response({"success": True, "value": FieldValueSerializer(value).data}, status=201)


class SequenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "customization.read")
        if denied:
            return denied
        qs = NumberSequence.objects.filter(tenant=tenant).order_by("code")
        return Response({"success": True, "sequences": SequenceSerializer(qs, many=True).data})

    def post(self, request):
        serializer = SequenceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "customization.manage")
        if denied:
            return denied
        data = serializer.validated_data
        if NumberSequence.objects.filter(tenant=tenant, code=data["code"]).exists():
            return Response(
                {"success": False, "error": {"code": "DUPLICATE_CODE", "message": "Sequence code exists"}},
                status=409,
            )
        seq = NumberSequence.objects.create(
            tenant=tenant,
            code=data["code"],
            name=data.get("name", ""),
            prefix=data.get("prefix", ""),
            suffix=data.get("suffix", ""),
            padding=data.get("padding", 4),
            next_number=data.get("next_number", 1),
            reset_period=data.get("reset_period"),
        )
        return Response({"success": True, "sequence": SequenceSerializer(seq).data}, status=201)


class SequenceNextView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SequenceNextSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "customization.manage")
        if denied:
            return denied
        try:
            result = sequences.next_value(tenant=tenant, code=serializer.validated_data["code"])
        except sequences.SequenceError as exc:
            return Response(
                {"success": False, "error": {"code": exc.code, "message": exc.message}}, status=exc.status
            )
        return Response({"success": True, "generated": result})


class CustomizationStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tenant = _resolve_tenant(request)
        except TenancyError as exc:
            return _tenant_error(exc)
        denied = _require_perm(request, "customization.read")
        if denied:
            return denied
        return Response(
            {
                "success": True,
                "tenant_id": str(tenant.id),
                "field_defs": CustomFieldDef.objects.filter(tenant=tenant).count(),
                "sequences": NumberSequence.objects.filter(tenant=tenant).count(),
                "can_manage": user_has_permission(request.user, "customization.manage"),
            }
        )
