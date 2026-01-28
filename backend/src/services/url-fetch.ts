/**
 * URL Fetch Service
 *
 * Fetches and extracts readable content from URLs.
 * Uses intelligent content extraction similar to Readability.
 *
 * @module services/url-fetch
 */

import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';

// Type alias for Cheerio loaded document
type CheerioDoc = ReturnType<typeof cheerio.load>;

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

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return createErrorResult(url, 'Nur HTTP und HTTPS URLs werden unterstützt.');
    }
  } catch {
    return createErrorResult(url, 'Ungültige URL.');
  }

  const domain = parsedUrl.hostname;

  logger.info('Fetching URL', { url, domain });

  try {
    // Fetch the page
    const response = await axios.get(url, {
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
    const axiosError = error as AxiosError;
    let errorMessage = 'Fehler beim Abrufen der URL.';

    if (axiosError.code === 'ECONNABORTED') {
      errorMessage = 'Zeitüberschreitung beim Abrufen der URL.';
    } else if (axiosError.response) {
      errorMessage = `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`;
    } else if (axiosError.code === 'ENOTFOUND') {
      errorMessage = 'Domain nicht gefunden.';
    } else if (axiosError.code === 'ECONNREFUSED') {
      errorMessage = 'Verbindung abgelehnt.';
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
    } catch {
      // Ignore JSON parse errors
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
    } catch {
      // Ignore JSON parse errors
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
  } catch {
    return url;
  }
}

function createErrorResult(url: string, error: string): FetchedContent {
  let domain = '';
  try {
    domain = new URL(url).hostname;
  } catch {
    // Ignore URL parse errors
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
  } catch {
    return false;
  }
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
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
