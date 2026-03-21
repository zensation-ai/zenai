-- Phase 98: TEXT → VARCHAR with Length Limits
-- Applies sensible VARCHAR limits to TEXT columns across all 4 schemas
-- Each ALTER is wrapped in BEGIN/EXCEPTION to handle columns that
-- are already the right type or don't exist

DO $$
DECLARE
  s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['personal', 'work', 'learning', 'creative'] LOOP

    -- =========================================================
    -- organizations: name, industry, website, email, phone,
    --                address, city, postal_code, country
    -- =========================================================

    BEGIN
      EXECUTE format('ALTER TABLE %I.organizations ALTER COLUMN name TYPE VARCHAR(255)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.organizations ALTER COLUMN industry TYPE VARCHAR(100)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.organizations ALTER COLUMN website TYPE VARCHAR(2048)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.organizations ALTER COLUMN email TYPE VARCHAR(320)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.organizations ALTER COLUMN phone TYPE VARCHAR(50)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.organizations ALTER COLUMN address TYPE VARCHAR(500)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.organizations ALTER COLUMN city TYPE VARCHAR(100)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.organizations ALTER COLUMN postal_code TYPE VARCHAR(20)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.organizations ALTER COLUMN country TYPE VARCHAR(100)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    -- =========================================================
    -- financial_accounts: name VARCHAR(255), currency VARCHAR(3)
    -- =========================================================

    BEGIN
      EXECUTE format('ALTER TABLE %I.financial_accounts ALTER COLUMN name TYPE VARCHAR(255)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.financial_accounts ALTER COLUMN currency TYPE VARCHAR(3)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    -- =========================================================
    -- transactions: category VARCHAR(100), payee VARCHAR(255)
    -- =========================================================

    BEGIN
      EXECUTE format('ALTER TABLE %I.transactions ALTER COLUMN category TYPE VARCHAR(100)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.transactions ALTER COLUMN payee TYPE VARCHAR(255)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    -- =========================================================
    -- budgets: name VARCHAR(255), category VARCHAR(100)
    -- =========================================================

    BEGIN
      EXECUTE format('ALTER TABLE %I.budgets ALTER COLUMN name TYPE VARCHAR(255)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.budgets ALTER COLUMN category TYPE VARCHAR(100)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    -- =========================================================
    -- financial_goals: name VARCHAR(255), category VARCHAR(100)
    -- =========================================================

    BEGIN
      EXECUTE format('ALTER TABLE %I.financial_goals ALTER COLUMN name TYPE VARCHAR(255)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.financial_goals ALTER COLUMN category TYPE VARCHAR(100)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    -- =========================================================
    -- browsing_history: url VARCHAR(8192)
    -- =========================================================

    BEGIN
      EXECUTE format('ALTER TABLE %I.browsing_history ALTER COLUMN url TYPE VARCHAR(8192)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

    -- =========================================================
    -- bookmarks: url VARCHAR(8192)
    -- =========================================================

    BEGIN
      EXECUTE format('ALTER TABLE %I.bookmarks ALTER COLUMN url TYPE VARCHAR(8192)', s);
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN others THEN NULL;
    END;

  END LOOP;
END $$;
