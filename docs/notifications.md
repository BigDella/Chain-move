# Notification domain

## Event taxonomy

Producers publish versioned events and never call email providers. Version 1 covers funding, investment confirmations, repayments, KYC decisions, payouts, arrears, and contract changes. `eventId` is a stable business-event ID. Payloads contain display-safe labels only—never KYC documents, secrets, bank details, or full financial records.

## Preference matrix

| Category | In-app | Email | Mandatory |
| --- | --- | --- | --- |
| Funding | On | On | No |
| Investment | On | On | No |
| Repayment | On | On | Due notices |
| KYC | On | On | Decisions |
| Payout | On | On | Status changes |
| Arrears | On | On | Yes |
| Contract | On | On | Yes |

Mandatory operational notices ignore disabled preferences. Preference links use signed, expiring tokens scoped to one user, category, and email channel; they do not grant account access.

## Template rules

Templates are keyed by event type and integer version. Rendering is deterministic, validates payloads, escapes HTML, and falls back to English while remaining locale-ready. Links use `NEXT_PUBLIC_APP_URL`, require HTTPS outside localhost, and accept internal paths only. Messages direct users to authenticated pages for sensitive details.

## Delivery lifecycle

`publishNotificationEvent` creates one `NotificationDelivery` per channel. The unique `{eventId}:{userId}:{channel}` key makes duplicate events harmless. In-app delivery is independent of email. Email progresses `scheduled → processing → delivered`; failures retry with exponential backoff and enter `dead_letter` after five attempts. Attempts retain timestamps, provider IDs, and redacted errors. A scheduler calls `POST /api/notifications/process` with `Authorization: Bearer $NOTIFICATION_WORKER_SECRET`.

User notification reads are user-scoped; admins may inspect a specified user. Delivery history and dead letters are operational data and must only be exposed to authorized admins.
