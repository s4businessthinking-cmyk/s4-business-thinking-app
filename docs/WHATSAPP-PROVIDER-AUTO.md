# WhatsApp provider auto (owner-owned API)

Optional. Default = open WhatsApp chat only (manual Send).

## Owner setup

1. Payment Reminders → Reminder settings
2. WhatsApp channel on
3. **WhatsApp provider** `https://...` + Bearer token (your WABA / BSP gateway that accepts `POST { to, message }`)
4. Automatic sending on → tick **WhatsApp provider**
5. **Where it runs**: this device (S4 open) or sync server (app may be closed, erp-server on VPS)

## Billing

- Message cost is on the **shop owner's** provider account, not S4 platform.

## Honesty

- 2xx = logged as `handedOffWhatsApp` ("accepted by your provider"), never "delivered".
- Link-based WhatsApp (no provider URL) is never automatic.

## Deploy

- App build includes client auto + manual provider send.
- **erp-server** must be updated for server-mode WhatsApp auto (same job as SMS/email).