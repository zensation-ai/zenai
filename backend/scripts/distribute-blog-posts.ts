/**
 * Distribute Blog Posts to Social Media
 *
 * Reads all English blog posts from website/content/blog/en/ and
 * drafts social media posts (Twitter, LinkedIn, Discord) for each
 * using the ContentAgent.
 *
 * Usage:
 *   cd backend && npx tsx scripts/distribute-blog-posts.ts
 *
 * Options:
 *   --dry-run    Show what would be drafted without calling Claude
 *   --platform   Only draft for one platform (twitter|linkedin|discord)
 *   --slug       Only process a specific blog post by slug
 *
 * Requires: ANTHROPIC_API_KEY in .env
 */

import * as fs from 'fs';
import * as path from 'path';

// Load env before any service imports
import dotenv from 'dotenv';
// Try backend/.env first, then project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { createContentAgent } from '../src/services/social/content-agent';
import type { AIContext } from '../src/utils/database-context';
import type { SocialPlatform, SourceType } from '../src/services/social/platform-types';

// ===========================================
// Blog post parser
// ===========================================

interface BlogPost {
  title: string;
  slug: string;
  date: string;
  excerpt: string;
  category: string;
  content: string;
  filePath: string;
}

function parseMdxFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*"?([^"]*)"?$/);
    if (kv) frontmatter[kv[1]] = kv[2];
  }

  return { frontmatter, body: match[2] };
}

function loadBlogPosts(blogDir: string, slugFilter?: string): BlogPost[] {
  const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.mdx'));
  const posts: BlogPost[] = [];

  for (const file of files) {
    const filePath = path.join(blogDir, file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseMdxFrontmatter(raw);

    const slug = frontmatter.slug || file.replace('.mdx', '');
    if (slugFilter && slug !== slugFilter) continue;

    posts.push({
      title: frontmatter.title || slug,
      slug,
      date: frontmatter.date || 'unknown',
      excerpt: frontmatter.excerpt || '',
      category: frontmatter.category || 'general',
      content: body.trim(),
      filePath,
    });
  }

  return posts.sort((a, b) => a.date.localeCompare(b.date));
}

// ===========================================
// Main
// ===========================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const slugFilter = args.find(a => a.startsWith('--slug='))?.split('=')[1];
  const platformFilter = args.find(a => a.startsWith('--platform='))?.split('=')[1] as SocialPlatform | undefined;

  const blogDir = path.resolve(__dirname, '../../website/content/blog/en');

  if (!fs.existsSync(blogDir)) {
    console.error(`Blog directory not found: ${blogDir}`);
    process.exit(1);
  }

  const posts = loadBlogPosts(blogDir, slugFilter);
  console.log(`Found ${posts.length} blog posts to distribute\n`);

  if (posts.length === 0) {
    console.log('No posts found. Use --slug=<slug> to filter.');
    process.exit(0);
  }

  // Show plan
  for (const post of posts) {
    const platforms = platformFilter ? [platformFilter] : ['twitter', 'linkedin', 'discord'];
    console.log(`  ${post.slug} (${post.date}) → ${platforms.join(', ')}`);
  }
  console.log();

  if (dryRun) {
    console.log('Dry run — no posts will be drafted.');
    process.exit(0);
  }

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set. Add it to .env or export it.');
    process.exit(1);
  }

  const context: AIContext = 'work';
  const agent = createContentAgent();
  let successCount = 0;
  let failCount = 0;

  for (const post of posts) {
    console.log(`\n--- Drafting: ${post.title} ---`);

    // Build source content: excerpt + first ~2000 chars of body
    const sourceContent = [
      `# ${post.title}`,
      post.excerpt ? `\n${post.excerpt}` : '',
      `\n${post.content.substring(0, 2000)}`,
      `\nLink: https://zensation.ai/blog/${post.slug}`,
    ].join('\n');

    if (platformFilter) {
      // Single platform
      try {
        const result = await agent.draftPost(
          {
            sourceType: 'blog' as SourceType,
            sourceContent,
            platform: platformFilter,
            locale: platformFilter === 'discord' ? 'de' : 'en',
            tone: 'professional',
          },
          context,
        );
        console.log(`  ✓ ${platformFilter}: ${result.content.substring(0, 80)}...`);
        successCount++;
      } catch (err) {
        console.error(`  ✗ ${platformFilter}: ${err instanceof Error ? err.message : err}`);
        failCount++;
      }
    } else {
      // All platforms
      try {
        const results = await agent.draftForAllPlatforms(sourceContent, 'blog' as SourceType, context);
        for (const r of results) {
          console.log(`  ✓ ${r.platform}: ${r.content.substring(0, 80)}...`);
        }
        successCount += results.length;
      } catch (err) {
        console.error(`  ✗ All platforms: ${err instanceof Error ? err.message : err}`);
        failCount++;
      }
    }

    // Rate limiting: 2s between posts to avoid API throttling
    if (posts.indexOf(post) < posts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n=== Done: ${successCount} drafted, ${failCount} failed ===`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
