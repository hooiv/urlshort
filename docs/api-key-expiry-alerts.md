# API key expiry warnings

Owners with a verified email get one email when an unrevoked API key is within 14 days of expiry (`API_KEY_EXPIRING_DAYS`). Keys are grouped into one email per owner.

- Cron: `GET /api/cron/api-key-expiry` daily 09:20 UTC (`CRON_SECRET` required).
- De-dup: compare-and-set on `api_keys.expiryWarnedAt`; a failed send clears the marker so the next run retries.
- Rotating a key (`/api/account/api-keys/rotate`) issues a new key with a fresh marker.
