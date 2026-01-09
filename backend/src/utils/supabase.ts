/**
 * Supabase Client Utility
 *
 * Provides Supabase client for direct database access and vector operations
 * Used for: Semantic search, vector similarity, realtime subscriptions
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

// ===========================================
// Configuration
// ===========================================

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// ===========================================
// Supabase Client
// ===========================================

let supabaseClient: SupabaseClient | null = null;
let isAvailable = false;

/**
 * Initialize Supabase client (lazy initialization)
 */
function getClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    logger.warn('Supabase not configured - vector search disabled');
    return null;
  }

  if (!supabaseClient) {
    try {
      supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });

      isAvailable = true;
      logger.info('Supabase client initialized');
    } catch (error) {
      logger.error('Failed to initialize Supabase client', error instanceof Error ? error : undefined);
      return null;
    }
  }

  return supabaseClient;
}

// ===========================================
// Public API
// ===========================================

export const supabase = {
  /**
   * Check if Supabase is available
   */
  isAvailable(): boolean {
    return isAvailable && getClient() !== null;
  },

  /**
   * Get the Supabase client instance
   */
  getClient(): SupabaseClient | null {
    return getClient();
  },

  /**
   * Perform semantic search on ideas
   */
  async searchIdeas(params: {
    embedding: number[];
    context: string;
    limit?: number;
    threshold?: number;
  }) {
    const client = getClient();
    if (!client) {
      throw new Error('Supabase not available');
    }

    const { embedding, context, limit = 10, threshold = 0.5 } = params;

    // Vector similarity search using pgvector
    const { data, error } = await client.rpc('search_ideas_by_embedding', {
      query_embedding: embedding,
      query_context: context,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      logger.error('Supabase search failed', error);
      throw error;
    }

    return data;
  },

  /**
   * Find similar ideas using vector similarity
   */
  async findSimilarIdeas(params: {
    ideaId: string;
    context: string;
    limit?: number;
  }) {
    const client = getClient();
    if (!client) {
      throw new Error('Supabase not available');
    }

    const { ideaId, context, limit = 5 } = params;

    const { data, error } = await client.rpc('find_similar_ideas', {
      target_id: ideaId,
      query_context: context,
      match_count: limit,
    });

    if (error) {
      logger.error('Supabase similar ideas failed', error);
      throw error;
    }

    return data;
  },

  /**
   * Health check
   */
  async healthCheck(): Promise<{ connected: boolean; latency?: number }> {
    const client = getClient();
    if (!client) {
      return { connected: false };
    }

    try {
      const start = Date.now();
      const { error } = await client.from('ideas').select('count').limit(1);
      const latency = Date.now() - start;

      if (error) {
        logger.error('Supabase health check failed', error);
        return { connected: false };
      }

      return { connected: true, latency };
    } catch (error) {
      logger.error('Supabase health check error', error instanceof Error ? error : undefined);
      return { connected: false };
    }
  },
};

/**
 * Database types (auto-generated from Supabase)
 * Run: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/database.types.ts
 */
export type Database = {
  public: {
    Tables: {
      ideas: {
        Row: {
          id: string;
          title: string;
          type: string;
          category: string;
          priority: string;
          summary: string | null;
          context: string;
          embedding: number[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          type: string;
          category: string;
          priority: string;
          summary?: string | null;
          context?: string;
          embedding?: number[] | null;
        };
        Update: {
          title?: string;
          type?: string;
          category?: string;
          priority?: string;
          summary?: string | null;
          embedding?: number[] | null;
        };
      };
    };
    Functions: {
      search_ideas_by_embedding: {
        Args: {
          query_embedding: number[];
          query_context: string;
          match_threshold: number;
          match_count: number;
        };
        Returns: Array<{
          id: string;
          title: string;
          similarity: number;
        }>;
      };
      find_similar_ideas: {
        Args: {
          target_id: string;
          query_context: string;
          match_count: number;
        };
        Returns: Array<{
          id: string;
          title: string;
          similarity: number;
        }>;
      };
    };
  };
};
