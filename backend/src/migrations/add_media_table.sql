-- Create media_items table for photos and videos
CREATE TABLE IF NOT EXISTS media_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('photo', 'video')),
    filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    caption TEXT,
    context VARCHAR(50),
    embedding vector(384),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on media type and context
CREATE INDEX IF NOT EXISTS idx_media_type ON media_items(media_type);
CREATE INDEX IF NOT EXISTS idx_media_context ON media_items(context);
CREATE INDEX IF NOT EXISTS idx_media_created_at ON media_items(created_at DESC);

-- Create vector index for similarity search
CREATE INDEX IF NOT EXISTS idx_media_embedding ON media_items USING ivfflat (embedding vector_cosine_ops);

-- Update voice_memos table to include embedding if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'voice_memos'
        AND column_name = 'embedding'
    ) THEN
        ALTER TABLE voice_memos ADD COLUMN embedding vector(384);
        CREATE INDEX idx_voice_memos_embedding ON voice_memos USING ivfflat (embedding vector_cosine_ops);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'voice_memos'
        AND column_name = 'context'
    ) THEN
        ALTER TABLE voice_memos ADD COLUMN context VARCHAR(50);
        CREATE INDEX idx_voice_memos_context ON voice_memos(context);
    END IF;
END $$;
