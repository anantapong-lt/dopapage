BEGIN;

-- BoostSMS `ref` is an opaque response value and must be preserved without
-- fixed-width CHAR padding before it is submitted to /api/v1/otp/verify.
ALTER TABLE phone_verification_requests
  ALTER COLUMN provider_token TYPE VARCHAR(255) USING BTRIM(provider_token);

COMMIT;
