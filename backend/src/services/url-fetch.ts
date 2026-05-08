/**
 * URL Fetch Service
 *
 * Fetches and extracts readable content from URLs.
 * Uses intelligent content extraction similar to Readability.
 *
 * @module services/url-fetch
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { checkedAxiosGet } from '../utils/checked-http';
import { logger } from '../utils/logger';
import { checkPublicUrl, SSRF_ERROR_CODES, type SsrfErrorCode } from './security/ssrf-guard';

// Type alias for Cheerio loaded document
type CheerioDoc = ReturnType<typeof cheerio.load>;

/** Parse a URL defensively for logging; returns `'invalid'` on malformed input. */
function safeHostname(url: string): string {
  try {
    return new URL(url).hostname || 'invalid';
  } catch {
    return 'invalid';
  }
}

// ===========================================
// Types
// ===========================================

export interface FetchedContent {
  /** Page title */
  title: string;
  /** Main content text */
  content: string;
  /** Meta description */
  description: string;
  /** URL that was fetched */
  url: string;
  /** Domain of the URL */
  domain: string;
  /** Estimated reading time in minutes */
  readingTimeMinutes: number;
  /** Word count */
  wordCount: number;
  /** Main image URL if found */
  mainImage?: string;
  /** Author if found */
  author?: string;
  /** Published date if found */
  publishedDate?: string;
  /** Whether content was successfully extracted */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

export interface FetchOptions {
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Maximum content length in characters (default: 50000) */
  maxContentLength?: number;
  /** Include images (default: false) */
  includeImages?: boolean;
  /** User agent string */
  userAgent?: string;
}

// ===========================================
// Constants
// ===========================================

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_MAX_CONTENT = 50000;
const DEFAULT_USER_AGENT = 'ZenAI/1.0 (Content Fetcher; +https://zensation.ai)';

// Tags to remove completely
const REMOVE_TAGS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'nav',
  'footer',
  'header',
  'aside',
  'form',
  'button',
  'input',
  'select',
  'textarea',
  'svg',
  'canvas',
  'video',
  'audio',
  'ad',
  'advertisement',
  '.ad',
  '.ads',
  '.advertisement',
  '.social-share',
  '.comments',
  '.sidebar',
  '.navigation',
  '.menu',
  '.footer',
  '.header',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="complementary"]',
  '[aria-hidden="true"]',
];

// Content container selectors (priority order)
const CONTENT_SELECTORS = [
  'article',
  '[role="main"]',
  'main',
  '.post-content',
  '.article-content',
  '.entry-content',
  '.content',
  '.post',
  '.article',
  '#content',
  '#main',
  '.main-content',
  '.story-body',
  '.blog-post',
  '.news-article',
];

// ===========================================
// URL Fetch Service
// ===========================================

/**
 * Fetch and extract content from a URL
 */
export async function fetchUrl(url: string, options: FetchOptions = {}): Promise<FetchedContent> {
  const {
    timeout = DEFAULT_TIMEOUT,
    maxContentLength = DEFAULT_MAX_CONTENT,
    userAgent = DEFAULT_USER_AGENT,
  } = options;

  const startTime = Date.now();

  // Validate URL + SSRF Protection (shared guard — see services/security/ssrf-guard.ts)
  const check = await checkPublicUrl(url);
  if (!check.safe) {
    if (check.code === SSRF_ERROR_CODES.INVALID_URL) {
      logger.warn('URL validation failed', { url, code: check.code, reason: check.reason });
      return createErrorResult(url, 'Ungültige URL.');
    }
    if (check.code === SSRF_ERROR_CODES.UNSUPPORTED_PROTOCOL) {
      return createErrorResult(url, 'Nur HTTP und HTTPS URLs werden unterstützt.');
    }
    logger.warn('SSRF blocked', {
      url,
      domain: safeHostname(url),
      code: check.code as SsrfErrorCode,
      reason: check.reason,
    });
    return createErrorResult(url, 'Diese URL kann aus Sicherheitsgründen nicht abgerufen werden.');
  }

  const parsedUrl = check.url;
  const domain = parsedUrl.hostname;

  logger.info('Fetching URL', { url, domain });

  try {
    // Fetch the page
    const response = await checkedAxiosGet<string>(url, {
      timeout,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
      },
      maxRedirects: 5,
      validateStatus: (status) => status < 400,
    });

    const html = response.data;

    if (typeof html !== 'string') {
      return createErrorResult(url, 'Antwort ist kein HTML.');
    }

    // Parse HTML
    const $ = cheerio.load(html);

    // Remove unwanted elements
    for (const selector of REMOVE_TAGS) {
      $(selector).remove();
    }

    // Extract metadata
    const title = extractTitle($);
    const description = extractDescription($);
    const mainImage = extractMainImage($, url);
    const author = extractAuthor($);
    const publishedDate = extractPublishedDate($);

    // Extract main content
    let content = extractMainContent($);

    // Clean up content
    content = cleanContent(content);

    // Truncate if too long
    if (content.length > maxContentLength) {
      content = content.substring(0, maxContentLength) + '...';
    }

    // Calculate stats
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
    const readingTimeMinutes = Math.ceil(wordCount / 200);

    const elapsed = Date.now() - startTime;
    logger.info('URL fetched successfully', {
      url,
      wordCount,
      elapsed,
    });

    return {
      title,
      content,
      description,
      url,
      domain,
      readingTimeMinutes,
      wordCount,
      mainImage,
      author,
      publishedDate,
      success: true,
    };
  } catch (error) {
    // SECURITY FIX: Proper type checking instead of unsafe type casting
    let errorMessage = 'Fehler beim Abrufen der URL.';

    if (axios.isAxiosError(error)) {
      // Safely handle Axios errors with proper type checking
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'Zeitüberschreitung beim Abrufen der URL.';
      } else if (error.response) {
        errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = 'Domain nicht gefunden.';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Verbindung abgelehnt.';
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    logger.warn('URL fetch failed', { url, error: errorMessage });
    return createErrorResult(url, errorMessage);
  }
}

// ===========================================
// Content Extraction Helpers
// ===========================================

function extractTitle($: CheerioDoc): string {
  // Try Open Graph title first
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (ogTitle?.trim()) {return ogTitle.trim();}

  // Try Twitter title
  const twitterTitle = $('meta[name="twitter:title"]').attr('content');
  if (twitterTitle?.trim()) {return twitterTitle.trim();}

  // Try h1
  const h1 = $('h1').first().text();
  if (h1?.trim()) {return h1.trim();}

  // Fallback to <title>
  const title = $('title').text();
  return title?.trim() || 'Kein Titel gefunden';
}

function extractDescription($: CheerioDoc): string {
  // Try Open Graph description
  const ogDesc = $('meta[property="og:description"]').attr('content');
  if (ogDesc?.trim()) {return ogDesc.trim();}

  // Try Twitter description
  const twitterDesc = $('meta[name="twitter:description"]').attr('content');
  if (twitterDesc?.trim()) {return twitterDesc.trim();}

  // Try standard meta description
  const metaDesc = $('meta[name="description"]').attr('content');
  if (metaDesc?.trim()) {return metaDesc.trim();}

  return '';
}

function extractMainImage($: CheerioDoc, baseUrl: string): string | undefined {
  // Try Open Graph image
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) {return resolveUrl(ogImage, baseUrl);}

  // Try Twitter image
  const twitterImage = $('meta[name="twitter:image"]').attr('content');
  if (twitterImage) {return resolveUrl(twitterImage, baseUrl);}

  // Try first large image in content
  const contentImg = $('article img, main img, .content img').first().attr('src');
  if (contentImg) {return resolveUrl(contentImg, baseUrl);}

  return undefined;
}

function extractAuthor($: CheerioDoc): string | undefined {
  // Try meta author
  const metaAuthor = $('meta[name="author"]').attr('content');
  if (metaAuthor?.trim()) {return metaAuthor.trim();}

  // Try JSON-LD
  const jsonLd = $('script[type="application/ld+json"]').first().html();
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd);
      if (data.author?.name) {return data.author.name;}
      if (typeof data.author === 'string') {return data.author;}
    } catch (e) {
      logger.warn('extractAuthor: JSON-LD parse failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Try common author selectors
  const authorSelectors = [
    '.author',
    '.byline',
    '[rel="author"]',
    '.post-author',
    '.article-author',
  ];

  for (const selector of authorSelectors) {
    const author = $(selector).first().text();
    if (author?.trim()) {return author.trim();}
  }

  return undefined;
}

function extractPublishedDate($: CheerioDoc): string | undefined {
  // Try meta tags
  const metaDate = $('meta[property="article:published_time"]').attr('content') ||
                   $('meta[name="date"]').attr('content') ||
                   $('meta[name="DC.date.issued"]').attr('content');
  if (metaDate) {return metaDate;}

  // Try time element
  const timeElement = $('time[datetime]').first().attr('datetime');
  if (timeElement) {return timeElement;}

  // Try JSON-LD
  const jsonLd = $('script[type="application/ld+json"]').first().html();
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd);
      if (data.datePublished) {return data.datePublished;}
    } catch (e) {
      logger.warn('extractDate: JSON-LD parse failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  return undefined;
}

function extractMainContent($: CheerioDoc): string {
  // Try content selectors in priority order
  for (const selector of CONTENT_SELECTORS) {
    const element = $(selector).first();
    if (element.length > 0) {
      const text = element.text();
      if (text && text.trim().length > 200) {
        return text;
      }
    }
  }

  // Fallback: Get body content
  return $('body').text();
}

function cleanContent(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove multiple spaces
    .replace(/  +/g, ' ')
    // Remove leading/trailing whitespace
    .trim()
    // Remove common noise patterns
    .replace(/Cookie-?[Ee]instellungen?/g, '')
    .replace(/Datenschutz(erkl[äa]rung)?/g, '')
    .replace(/Akzeptieren( alle)?/g, '')
    .replace(/Newsletter( anmelden)?/g, '')
    // Clean up line breaks
    .replace(/\n\s*\n/g, '\n\n');
}

function resolveUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href;
  } catch (e) {
    logger.warn('resolveUrl failed', { error: e instanceof Error ? e.message : String(e) });
    return url;
  }
}

function createErrorResult(url: string, error: string): FetchedContent {
  let domain = '';
  try {
    domain = new URL(url).hostname;
  } catch (e) {
    logger.warn('extractDomain: URL parse failed', { error: e instanceof Error ? e.message : String(e) });
  }

  return {
    title: '',
    content: '',
    description: '',
    url,
    domain,
    readingTimeMinutes: 0,
    wordCount: 0,
    success: false,
    error,
  };
}

// ===========================================
// URL Validation & Utilities
// ===========================================

/**
 * Check if a URL is valid and fetchable
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (e) {
    logger.warn('isValidUrl: URL parse failed', { error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/**
 * Backwards-compatible SSRF check — use `assertPublicUrl` from
 * `services/security/ssrf-guard.ts` in new code. Returns the legacy
 * `{ safe, reason }` shape that older call sites expect.
 */
export async function validateHostSSRF(
  hostname: string
): Promise<{ safe: boolean; reason?: string }> {
  // Accept either a bare hostname or a full URL (callers historically passed both).
  const url = hostname.includes('://') ? hostname : `https://${hostname}`;
  const check = await checkPublicUrl(url);
  if (check.safe) {
    return { safe: true };
  }
  return { safe: false, reason: check.reason };
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch (e) {
    logger.warn('getHostname: URL parse failed', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/**
 * Summarize fetched content for tool output
 */
export function formatForTool(result: FetchedContent): string {
  if (!result.success) {
    return `Fehler beim Abrufen von ${result.url}: ${result.error}`;
  }

  const parts: string[] = [];

  parts.push(`**${result.title}**`);
  parts.push(`URL: ${result.url}`);

  if (result.description) {
    parts.push(`\n> ${result.description}`);
  }

  if (result.author) {
    parts.push(`Autor: ${result.author}`);
  }

  if (result.publishedDate) {
    parts.push(`Veröffentlicht: ${result.publishedDate}`);
  }

  parts.push(`\n---\n`);
  parts.push(result.content);
  parts.push(`\n---`);
  parts.push(`_${result.wordCount} Wörter, ~${result.readingTimeMinutes} Min. Lesezeit_`);

  return parts.join('\n');
}
