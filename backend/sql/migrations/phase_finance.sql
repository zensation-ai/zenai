-- ============================================================
-- Phase 4: Finanzen & Ausgaben
-- Creates financial_accounts, transactions, budgets, financial_goals
-- in all 4 context schemas
-- ============================================================

DO $
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- Financial Accounts
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.financial_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        account_type TEXT NOT NULL CHECK (account_type IN (''checking'', ''savings'', ''credit'', ''cash'', ''investment'')),
        currency TEXT DEFAULT ''EUR'',
        balance DECIMAL(12,2) DEFAULT 0,
        institution TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        metadata JSONB DEFAULT ''{}'',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    ', s);

    -- Transactions
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID REFERENCES %I.financial_accounts(id) ON DELETE SET NULL,
        amount DECIMAL(12,2) NOT NULL,
        currency TEXT DEFAULT ''EUR'',
        transaction_type TEXT NOT NULL CHECK (transaction_type IN (''income'', ''expense'', ''transfer'')),
        category TEXT,
        subcategory TEXT,
        payee TEXT,
        description TEXT,
        transaction_date DATE NOT NULL,
        is_recurring BOOLEAN DEFAULT FALSE,
        recurring_id UUID,
        tags TEXT[] DEFAULT ''{}'',
        receipt_url TEXT,
        ai_category TEXT,
        ai_category_confidence DECIMAL(3,2),
        metadata JSONB DEFAULT ''{}'',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    ', s, s);

    -- Budgets
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.budgets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        amount_limit DECIMAL(12,2) NOT NULL,
        period TEXT DEFAULT ''monthly'' CHECK (period IN (''weekly'', ''monthly'', ''quarterly'', ''yearly'')),
        current_spent DECIMAL(12,2) DEFAULT 0,
        alert_threshold DECIMAL(3,2) DEFAULT 0.80,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    ', s);

    -- Financial Goals
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.financial_goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        target_amount DECIMAL(12,2) NOT NULL,
        current_amount DECIMAL(12,2) DEFAULT 0,
        deadline DATE,
        category TEXT,
        priority TEXT DEFAULT ''medium'' CHECK (priority IN (''low'', ''medium'', ''high'')),
        is_completed BOOLEAN DEFAULT FALSE,
        metadata JSONB DEFAULT ''{}'',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    ', s);

    -- Indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_transactions_date ON %I.transactions(transaction_date DESC);', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_transactions_type ON %I.transactions(transaction_type);', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_transactions_category ON %I.transactions(category);', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_transactions_account ON %I.transactions(account_id);', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_transactions_payee ON %I.transactions(payee);', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_budgets_category ON %I.budgets(category);', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_budgets_active ON %I.budgets(is_active) WHERE is_active = TRUE;', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_goals_completed ON %I.financial_goals(is_completed) WHERE is_completed = FALSE;', s, s);

  END LOOP;
END
$;
