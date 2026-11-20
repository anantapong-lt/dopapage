BEGIN;

CREATE TABLE IF NOT EXISTS coin_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'topup',
    'purchase',
    'sale',
    'withdrawal_request',
    'withdrawal_refund',
    'admin_adjustment'
  )),
  amount NUMERIC(12, 2) NOT NULL,
  balance_before NUMERIC(12, 2) NOT NULL,
  balance_after NUMERIC(12, 2) NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coin_ledger_balance_check CHECK (balance_after = balance_before + amount)
);

CREATE INDEX IF NOT EXISTS coin_ledger_user_created_at_idx
  ON coin_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS coin_ledger_created_at_idx
  ON coin_ledger (created_at DESC);

INSERT INTO schema_migrations (version) VALUES ('024_add_coin_ledger');

COMMIT;
