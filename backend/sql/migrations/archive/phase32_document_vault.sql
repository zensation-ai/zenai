-- Phase 32: Document Vault
-- ZenAI Document Vault - KI-erkennbarer Dokumentenspeicher mit automatischer Organisation
-- Migration Date: 2026-02-07

-- =====================================================
-- 1. MAIN DOCUMENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- File metadata
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    storage_provider VARCHAR(20) DEFAULT 'local' CHECK (storage_provider IN ('local', 'supabase')),
    file_hash VARCHAR(64) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    page_count INTEGER,

    -- AI-generated content
    title VARCHAR(500),
    summary TEXT,
    full_text TEXT,
    keywords TEXT[] DEFAULT '{}',
    language VARCHAR(10),

    -- Vector embeddings for semantic search
    embedding vector(768),
    chunk_count INTEGER DEFAULT 1,

    -- Organization - Hybrid system (folders + tags + topics)
    context VARCHAR(20) DEFAULT 'personal' CHECK (context IN ('personal', 'work')),
    primary_topic_id UUID REFERENCES idea_topics(id) ON DELETE SET NULL,
    folder_path VARCHAR(500) DEFAULT '/',
    tags TEXT[] DEFAULT '{}',

    -- Processing status
    processing_status VARCHAR(20) DEFAULT 'pending'
        CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
    processing_error TEXT,
    ocr_confidence FLOAT,

    -- Linking to other entities
    linked_idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
    source_url TEXT,

    -- User interaction tracking
    view_count INTEGER DEFAULT 0,
    last_viewed_at TIMESTAMP WITH TIME ZONE,
    is_favorite BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- =====================================================
-- 2. DOCUMENT CHUNKS TABLE (for RAG with long documents)
-- =====================================================

CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(768),
    page_number INTEGER,
    char_start INTEGER,
    char_end INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(document_id, chunk_index)
);

-- =====================================================
-- 3. DOCUMENT TOPIC MEMBERSHIPS (reuses idea_topics)
-- =====================================================

CREATE TABLE IF NOT EXISTS document_topic_memberships (
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES idea_topics(id) ON DELETE CASCADE,
    membership_score FLOAT DEFAULT 1.0 CHECK (membership_score >= 0 AND membership_score <= 1),
    is_primary BOOLEAN DEFAULT FALSE,
    assigned_by VARCHAR(20) DEFAULT 'auto' CHECK (assigned_by IN ('auto', 'manual')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (document_id, topic_id)
);

-- =====================================================
-- 4. DOCUMENT FOLDERS (virtual folder structure)
-- =====================================================

CREATE TABLE IF NOT EXISTS document_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context VARCHAR(20) NOT NULL CHECK (context IN ('personal', 'work')),
    path VARCHAR(500) NOT NULL,
    name VARCHAR(255) NOT NULL,
    parent_path VARCHAR(500),
    color VARCHAR(7),
    icon VARCHAR(50),
    document_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(context, path)
);

-- =====================================================
-- 5. DOCUMENT ACCESS LOG (for analytics and ML)
-- =====================================================

CREATE TABLE IF NOT EXISTS document_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    access_type VARCHAR(20) NOT NULL CHECK (access_type IN ('view', 'download', 'search_result', 'chat_reference')),
    search_query TEXT,
    relevance_score FLOAT,
    session_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 6. INDEXES FOR PERFORMANCE
-- =====================================================

-- Primary indexes
CREATE INDEX IF NOT EXISTS idx_documents_context ON documents(context);
CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(processing_status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_path);
CREATE INDEX IF NOT EXISTS idx_documents_mime_type ON documents(mime_type);
CREATE INDEX IF NOT EXISTS idx_documents_archived ON documents(is_archived);
CREATE INDEX IF NOT EXISTS idx_documents_favorite ON documents(is_favorite);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_documents_fulltext ON documents
    USING gin(to_tsvector('german', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(full_text, '')));

-- Vector indexes (HNSW for fast approximate nearest neighbor search)
CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document ON document_chunks(document_id);

-- Topic membership indexes
CREATE INDEX IF NOT EXISTS idx_doc_topic_membership_topic ON document_topic_memberships(topic_id);
CREATE INDEX IF NOT EXISTS idx_doc_topic_membership_score ON document_topic_memberships(membership_score DESC);

-- Folder indexes
CREATE INDEX IF NOT EXISTS idx_document_folders_parent ON document_folders(parent_path);

-- Access log indexes
CREATE INDEX IF NOT EXISTS idx_document_access_log_doc ON document_access_log(document_id);
CREATE INDEX IF NOT EXISTS idx_document_access_log_created ON document_access_log(created_at DESC);

-- =====================================================
-- 7. TRIGGERS
-- =====================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_documents_updated_at ON documents;
CREATE TRIGGER trigger_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_documents_updated_at();

-- Update folder document count trigger
CREATE OR REPLACE FUNCTION update_folder_document_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE document_folders
        SET document_count = document_count + 1, updated_at = NOW()
        WHERE context = NEW.context AND path = NEW.folder_path;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE document_folders
        SET document_count = document_count - 1, updated_at = NOW()
        WHERE context = OLD.context AND path = OLD.folder_path;
    ELSIF TG_OP = 'UPDATE' AND OLD.folder_path != NEW.folder_path THEN
        UPDATE document_folders
        SET document_count = document_count - 1, updated_at = NOW()
        WHERE context = OLD.context AND path = OLD.folder_path;
        UPDATE document_folders
        SET document_count = document_count + 1, updated_at = NOW()
        WHERE context = NEW.context AND path = NEW.folder_path;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_folder_document_count ON documents;
CREATE TRIGGER trigger_folder_document_count
    AFTER INSERT OR UPDATE OF folder_path OR DELETE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_folder_document_count();

-- =====================================================
-- 8. DEFAULT FOLDERS
-- =====================================================

INSERT INTO document_folders (context, path, name, parent_path, icon) VALUES
    ('personal', '/', 'Root', NULL, 'folder'),
    ('personal', '/inbox', 'Inbox', '/', 'inbox'),
    ('personal', '/archive', 'Archiv', '/', 'archive'),
    ('work', '/', 'Root', NULL, 'folder'),
    ('work', '/inbox', 'Inbox', '/', 'inbox'),
    ('work', '/projects', 'Projekte', '/', 'briefcase'),
    ('work', '/contracts', 'Verträge', '/', 'file-text'),
    ('work', '/invoices', 'Rechnungen', '/', 'receipt')
ON CONFLICT (context, path) DO NOTHING;

-- =====================================================
-- 9. HELPER FUNCTIONS
-- =====================================================

-- Function to get folder hierarchy
CREATE OR REPLACE FUNCTION get_folder_tree(p_context VARCHAR(20))
RETURNS TABLE (
    id UUID,
    path VARCHAR(500),
    name VARCHAR(255),
    parent_path VARCHAR(500),
    depth INTEGER,
    document_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE folder_tree AS (
        SELECT f.id, f.path, f.name, f.parent_path, 0 AS depth, f.document_count
        FROM document_folders f
        WHERE f.context = p_context AND f.parent_path IS NULL

        UNION ALL

        SELECT f.id, f.path, f.name, f.parent_path, ft.depth + 1, f.document_count
        FROM document_folders f
        JOIN folder_tree ft ON f.parent_path = ft.path
        WHERE f.context = p_context
    )
    SELECT * FROM folder_tree ORDER BY path;
END;
$$ LANGUAGE plpgsql;

-- Function to search documents semantically
CREATE OR REPLACE FUNCTION search_documents_semantic(
    p_query_embedding vector(768),
    p_context VARCHAR(20),
    p_limit INTEGER DEFAULT 10,
    p_min_similarity FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    id UUID,
    title VARCHAR(500),
    summary TEXT,
    mime_type VARCHAR(100),
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.title,
        d.summary,
        d.mime_type,
        1 - (d.embedding <=> p_query_embedding) AS similarity
    FROM documents d
    WHERE
        d.context = p_context
        AND d.embedding IS NOT NULL
        AND d.is_archived = FALSE
        AND 1 - (d.embedding <=> p_query_embedding) >= p_min_similarity
    ORDER BY d.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to search document chunks
CREATE OR REPLACE FUNCTION search_document_chunks(
    p_query_embedding vector(768),
    p_context VARCHAR(20),
    p_limit INTEGER DEFAULT 20,
    p_min_similarity FLOAT DEFAULT 0.4
)
RETURNS TABLE (
    chunk_id UUID,
    document_id UUID,
    document_title VARCHAR(500),
    chunk_content TEXT,
    page_number INTEGER,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id AS chunk_id,
        d.id AS document_id,
        d.title AS document_title,
        c.content AS chunk_content,
        c.page_number,
        1 - (c.embedding <=> p_query_embedding) AS similarity
    FROM document_chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE
        d.context = p_context
        AND c.embedding IS NOT NULL
        AND d.is_archived = FALSE
        AND 1 - (c.embedding <=> p_query_embedding) >= p_min_similarity
    ORDER BY c.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 10. GRANTS (for Supabase)
-- =====================================================

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_topic_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access_log ENABLE ROW LEVEL SECURITY;

-- Policies (allow all for now, can be restricted later)
CREATE POLICY "Allow all for documents" ON documents FOR ALL USING (true);
CREATE POLICY "Allow all for document_chunks" ON document_chunks FOR ALL USING (true);
CREATE POLICY "Allow all for document_topic_memberships" ON document_topic_memberships FOR ALL USING (true);
CREATE POLICY "Allow all for document_folders" ON document_folders FOR ALL USING (true);
CREATE POLICY "Allow all for document_access_log" ON document_access_log FOR ALL USING (true);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
