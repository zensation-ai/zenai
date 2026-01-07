import express, { Request, Response } from 'express';
import { query } from '../utils/database';
import { generateEmbedding } from '../utils/ollama';
import crypto from 'crypto';

const router = express.Router();

/**
 * GET /api/stories
 * Get automatically grouped content (stories) based on semantic similarity
 *
 * Example: All content related to "Firmengründung" grouped together
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { query: searchQuery, minItems = '2', similarityThreshold = '0.7' } = req.query;

    // If a search query is provided, find related stories
    if (searchQuery && typeof searchQuery === 'string') {
      const stories = await findStoriesByQuery(
        searchQuery,
        parseInt(minItems as string),
        parseFloat(similarityThreshold as string)
      );

      return res.json({
        stories,
        total: stories.length
      });
    }

    // Otherwise, return pre-computed story clusters
    const stories = await getAllStories();

    res.json({
      stories,
      total: stories.length
    });

  } catch (error) {
    console.error('❌ Error fetching stories:', error);
    res.status(500).json({ error: 'Failed to fetch stories' });
  }
});

/**
 * Find stories by semantic search query
 */
async function findStoriesByQuery(
  searchQuery: string,
  minItems: number,
  similarityThreshold: number
): Promise<any[]> {
  console.log(`🔍 Finding stories for: "${searchQuery}"`);

  // 1. Generate embedding for search query
  const queryEmbedding = await generateEmbedding(searchQuery);

  // 2. Find all items (ideas, media, voice memos) similar to the query
  const similarItems = await query(
    `
    WITH combined_items AS (
      SELECT
        id,
        'idea' as item_type,
        title as content,
        context,
        embedding,
        created_at,
        NULL as media_type,
        NULL as file_path
      FROM ideas
      WHERE embedding IS NOT NULL

      UNION ALL

      SELECT
        id,
        'media' as item_type,
        COALESCE(caption, filename) as content,
        context,
        embedding,
        created_at,
        media_type,
        file_path
      FROM media_items
      WHERE embedding IS NOT NULL

      UNION ALL

      SELECT
        id,
        'voice_memo' as item_type,
        raw_text as content,
        context,
        embedding,
        created_at,
        NULL as media_type,
        NULL as file_path
      FROM voice_memos
      WHERE embedding IS NOT NULL
    )
    SELECT
      *,
      1 - (embedding <=> $1::vector) as similarity
    FROM combined_items
    WHERE 1 - (embedding <=> $1::vector) > $2
    ORDER BY similarity DESC
    LIMIT 100
    `,
    [`[${queryEmbedding.join(',')}]`, similarityThreshold]
  );

  if (similarItems.rows.length < minItems) {
    return [{
      id: crypto.randomUUID(),
      title: searchQuery,
      description: `Noch nicht genug Inhalte gefunden (${similarItems.rows.length} von mindestens ${minItems})`,
      items: similarItems.rows.map(formatStoryItem),
      created_at: new Date(),
      updated_at: new Date(),
      item_count: similarItems.rows.length
    }];
  }

  // 3. Group into a story
  const story = {
    id: crypto.randomUUID(),
    title: searchQuery,
    description: `Automatisch gruppierte Inhalte zu "${searchQuery}"`,
    items: similarItems.rows.map(formatStoryItem),
    created_at: new Date(Math.min(...similarItems.rows.map((r: any) => new Date(r.created_at).getTime()))),
    updated_at: new Date(Math.max(...similarItems.rows.map((r: any) => new Date(r.created_at).getTime()))),
    item_count: similarItems.rows.length
  };

  return [story];
}

/**
 * Get all pre-computed story clusters using optimized batch clustering
 *
 * OPTIMIZED: Uses a single SQL query with cross-join similarity instead of N+1 queries
 */
async function getAllStories(): Promise<any[]> {
  // Get all items with embeddings and pre-compute similarities in SQL
  // This avoids N+1 query problem by using a single batch query
  const clusterResult = await query(
    `
    WITH combined_items AS (
      SELECT
        id,
        'idea' as item_type,
        title as content,
        context,
        embedding,
        created_at,
        NULL as media_type,
        NULL as file_path
      FROM ideas
      WHERE embedding IS NOT NULL AND is_archived = false

      UNION ALL

      SELECT
        id,
        'media' as item_type,
        COALESCE(caption, filename) as content,
        context,
        embedding,
        created_at,
        media_type,
        file_path
      FROM media_items
      WHERE embedding IS NOT NULL

      UNION ALL

      SELECT
        id,
        'voice_memo' as item_type,
        raw_text as content,
        context,
        embedding,
        created_at,
        NULL as media_type,
        NULL as file_path
      FROM voice_memos
      WHERE embedding IS NOT NULL
    ),
    -- Pre-compute all pairwise similarities above threshold
    similarities AS (
      SELECT
        a.id as source_id,
        b.id as target_id,
        1 - (a.embedding <=> b.embedding) as similarity
      FROM combined_items a
      CROSS JOIN combined_items b
      WHERE a.id < b.id  -- Avoid duplicates and self-joins
        AND 1 - (a.embedding <=> b.embedding) > 0.75
    )
    SELECT
      ci.*,
      COALESCE(
        json_agg(
          json_build_object('target_id', s.target_id, 'similarity', s.similarity)
        ) FILTER (WHERE s.target_id IS NOT NULL),
        '[]'::json
      ) as similar_items
    FROM combined_items ci
    LEFT JOIN similarities s ON ci.id = s.source_id OR ci.id = s.target_id
    GROUP BY ci.id, ci.item_type, ci.content, ci.context, ci.embedding, ci.created_at, ci.media_type, ci.file_path
    ORDER BY ci.created_at DESC
    LIMIT 200
    `
  );

  if (clusterResult.rows.length === 0) {
    return [];
  }

  // Build clusters from pre-computed similarities (thread-safe in-memory)
  const itemMap = new Map<string, any>();
  const processed = new Set<string>();
  const clusters: Map<string, any[]> = new Map();

  // First pass: build item map
  for (const item of clusterResult.rows) {
    itemMap.set(item.id, item);
  }

  // Second pass: build clusters
  for (const item of clusterResult.rows) {
    if (processed.has(item.id)) continue;

    const similarItemIds: string[] = [];

    // Parse similar items from the JSON aggregation
    if (Array.isArray(item.similar_items)) {
      for (const sim of item.similar_items) {
        if (sim.target_id && sim.target_id !== item.id && !processed.has(sim.target_id)) {
          similarItemIds.push(sim.target_id);
        }
      }
    }

    // Also check reverse relationships (where this item is the target)
    for (const [otherId, otherItem] of itemMap) {
      if (otherId === item.id || processed.has(otherId)) continue;
      if (Array.isArray(otherItem.similar_items)) {
        for (const sim of otherItem.similar_items) {
          if (sim.target_id === item.id && !similarItemIds.includes(otherId)) {
            similarItemIds.push(otherId);
          }
        }
      }
    }

    if (similarItemIds.length >= 1) {
      // Create cluster
      const clusterItems = [item];
      processed.add(item.id);

      for (const simId of similarItemIds) {
        const simItem = itemMap.get(simId);
        if (simItem && !processed.has(simId)) {
          clusterItems.push(simItem);
          processed.add(simId);
        }
      }

      clusters.set(item.id, clusterItems.map(formatStoryItem));
    }
  }

  // Convert clusters to stories
  const stories = Array.from(clusters.entries()).map(([_id, items]) => ({
    id: crypto.randomUUID(),
    title: generateTitleFromItems(items),
    description: `${items.length} verwandte Inhalte`,
    items,
    created_at: new Date(Math.min(...items.map((item: any) => new Date(item.timestamp).getTime()))),
    updated_at: new Date(Math.max(...items.map((item: any) => new Date(item.timestamp).getTime()))),
    item_count: items.length
  }));

  return stories;
}

/**
 * Format story item for response
 */
function formatStoryItem(row: any): any {
  return {
    id: row.id,
    type: row.item_type,
    content: row.content,
    media_url: row.file_path ? `/api/media/${row.id}` : null,
    timestamp: row.created_at
  };
}

/**
 * Generate a title from story items
 */
function generateTitleFromItems(items: any[]): string {
  if (items.length === 0) return 'Unbekannte Story';

  // Extract keywords from content
  const allContent = items.map((i: any) => i.content).join(' ');
  const words = allContent
    .toLowerCase()
    .split(/\s+/)
    .filter((w: string) => w.length > 4)
    .reduce((acc: Map<string, number>, word: string) => {
      acc.set(word, (acc.get(word) || 0) + 1);
      return acc;
    }, new Map());

  // Get most common word
  const sorted = Array.from(words.entries())
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length > 0) {
    const keyword = sorted[0][0];
    return `Story: ${keyword.charAt(0).toUpperCase() + keyword.slice(1)}`;
  }

  return `Story (${items.length} Items)`;
}


export default router;
