BEGIN;

CREATE TABLE password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_token VARCHAR(255),
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  reset_token_hash CHAR(64),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX password_reset_requests_active_user_unique_idx
  ON password_reset_requests (user_id)
  WHERE user_id IS NOT NULL AND consumed_at IS NULL;

CREATE INDEX password_reset_requests_expiry_idx ON password_reset_requests (expires_at);

COMMIT;
