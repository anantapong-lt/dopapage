BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phone_verification_requests' AND column_name = 'provider_token'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phone_verification_requests' AND column_name = 'otp_hash'
  ) THEN
    ALTER TABLE phone_verification_requests RENAME COLUMN provider_token TO otp_hash;
  END IF;
END $$;

COMMIT;
