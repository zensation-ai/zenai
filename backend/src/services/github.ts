/**
 * GitHub Integration Service
 *
 * Provides GitHub API access for repository management, issues, and PRs.
 * Uses OAuth2 for authentication (GitHub Apps or OAuth Apps).
 *
 * Features:
 * - Repository search and information
 * - Issue creation and management
 * - Pull request summaries
 * - Code search
 *
 * @module services/github
 */

import axios from 'axios';
// pool.query() is intentional here: user_integrations is a global table (not per-context)
import { pool } from '../utils/database';
import { logger } from '../utils/logger';

// ===========================================
// Constants
// ===========================================

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

// Required OAuth scopes
const OAUTH_SCOPES = [
  'repo',           // Full repository access
  'read:user',      // Read user profile
  'read:org',       // Read organization membership
];

// ===========================================
// Types
// ===========================================

export interface GitHubTokens {
  accessToken: string;
  tokenType: string;
  scope: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  htmlUrl: string;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
  openIssuesCount: number;
  defaultBranch: string;
  updatedAt: string;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  htmlUrl: string;
  user: { login: string };
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed' | 'merged';
  htmlUrl: string;
  user: { login: string };
  head: { ref: string; sha: string };
  base: { ref: string };
  draft: boolean;
  mergeable: boolean | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubSearchResult {
  totalCount: number;
  items: GitHubRepository[];
}

export interface CreateIssueParams {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

// ===========================================
// Configuration
// ===========================================

function getConfig() {
  return {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    personalAccessToken: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '',
  };
}

/**
 * Check if GitHub integration is available
 */
export function isGitHubAvailable(): boolean {
  const config = getConfig();
  return !!(config.personalAccessToken || (config.clientId && config.clientSecret));
}

/**
 * Get authorization headers
 */
function getAuthHeaders(accessToken?: string): Record<string, string> {
  const token = accessToken || getConfig().personalAccessToken;

  if (!token) {
    throw new Error('No GitHub access token available');
  }

  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

// ===========================================
// OAuth2 Flow
// ===========================================

/**
 * Generate OAuth authorization URL
 */
export function getAuthorizationUrl(redirectUri: string, state: string): string {
  const config = getConfig();

  if (!config.clientId) {
    throw new Error('GITHUB_CLIENT_ID not configured');
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPES.join(' '),
    state,
  });

  return `${GITHUB_OAUTH_URL}?${params.toString()}`;
}

/**
 * Exchange OAuth code for access token
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<GitHubTokens> {
  const config = getConfig();

  const response = await axios.post(
    GITHUB_TOKEN_URL,
    {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
    },
    {
      headers: {
        'Accept': 'application/json',
      },
    }
  );

  const data = response.data;

  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

/**
 * Store GitHub tokens for a user
 */
export async function storeTokens(
  userId: string,
  tokens: GitHubTokens
): Promise<void> {
  await pool.query(
    `INSERT INTO user_integrations (user_id, provider, access_token, scopes, created_at, updated_at)
     VALUES ($1, 'github', $2, $3, NOW(), NOW())
     ON CONFLICT (user_id, provider)
     DO UPDATE SET access_token = $2, scopes = $3, updated_at = NOW()`,
    [userId, tokens.accessToken, tokens.scope]
  );

  logger.info('GitHub tokens stored', { userId });
}

/**
 * Get stored GitHub tokens for a user
 */
export async function getStoredTokens(userId: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT access_token FROM user_integrations
     WHERE user_id = $1 AND provider = 'github'`,
    [userId]
  );

  return result.rows[0]?.access_token || null;
}

// ===========================================
// GitHub API Functions
// ===========================================

/**
 * Get authenticated user info
 */
export async function getAuthenticatedUser(accessToken?: string): Promise<GitHubUser> {
  const response = await axios.get(`${GITHUB_API_BASE}/user`, {
    headers: getAuthHeaders(accessToken),
  });

  const data = response.data;
  return {
    id: data.id,
    login: data.login,
    name: data.name,
    email: data.email,
    avatarUrl: data.avatar_url,
  };
}

/**
 * Search repositories
 */
export async function searchRepositories(
  query: string,
  options: { limit?: number; sort?: 'stars' | 'forks' | 'updated' } = {},
  accessToken?: string
): Promise<GitHubSearchResult> {
  const { limit = 10, sort = 'stars' } = options;

  const response = await axios.get(`${GITHUB_API_BASE}/search/repositories`, {
    headers: getAuthHeaders(accessToken),
    params: {
      q: query,
      sort,
      order: 'desc',
      per_page: limit,
    },
  });

  return {
    totalCount: response.data.total_count,
    items: response.data.items.map(mapRepository),
  };
}

/**
 * Get repository information
 */
export async function getRepository(
  owner: string,
  repo: string,
  accessToken?: string
): Promise<GitHubRepository> {
  const response = await axios.get(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}`,
    { headers: getAuthHeaders(accessToken) }
  );

  return mapRepository(response.data);
}

/**
 * List repository issues
 */
export async function listIssues(
  owner: string,
  repo: string,
  options: { state?: 'open' | 'closed' | 'all'; limit?: number } = {},
  accessToken?: string
): Promise<GitHubIssue[]> {
  const { state = 'open', limit = 10 } = options;

  const response = await axios.get(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`,
    {
      headers: getAuthHeaders(accessToken),
      params: {
        state,
        per_page: limit,
        sort: 'updated',
        direction: 'desc',
      },
    }
  );

  return response.data
    .filter((item: { pull_request?: unknown }) => !item.pull_request) // Exclude PRs
    .map(mapIssue);
}

/**
 * Create a new issue
 */
export async function createIssue(
  params: CreateIssueParams,
  accessToken?: string
): Promise<GitHubIssue> {
  const { owner, repo, title, body, labels, assignees } = params;

  const response = await axios.post(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`,
    {
      title,
      body,
      labels,
      assignees,
    },
    { headers: getAuthHeaders(accessToken) }
  );

  logger.info('GitHub issue created', { owner, repo, number: response.data.number });

  return mapIssue(response.data);
}

/**
 * Get issue details
 */
export async function getIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  accessToken?: string
): Promise<GitHubIssue> {
  const response = await axios.get(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${issueNumber}`,
    { headers: getAuthHeaders(accessToken) }
  );

  return mapIssue(response.data);
}

/**
 * List pull requests
 */
export async function listPullRequests(
  owner: string,
  repo: string,
  options: { state?: 'open' | 'closed' | 'all'; limit?: number } = {},
  accessToken?: string
): Promise<GitHubPullRequest[]> {
  const { state = 'open', limit = 10 } = options;

  const response = await axios.get(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls`,
    {
      headers: getAuthHeaders(accessToken),
      params: {
        state,
        per_page: limit,
        sort: 'updated',
        direction: 'desc',
      },
    }
  );

  return response.data.map(mapPullRequest);
}

/**
 * Get pull request details with diff stats
 */
export async function getPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  accessToken?: string
): Promise<GitHubPullRequest> {
  const response = await axios.get(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}`,
    { headers: getAuthHeaders(accessToken) }
  );

  return mapPullRequest(response.data);
}

/**
 * Get pull request diff/files
 */
export async function getPullRequestFiles(
  owner: string,
  repo: string,
  prNumber: number,
  accessToken?: string
): Promise<Array<{ filename: string; status: string; additions: number; deletions: number }>> {
  const response = await axios.get(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}/files`,
    { headers: getAuthHeaders(accessToken) }
  );

  return response.data.map((file: {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
  }) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
  }));
}

/**
 * Search code in repositories
 */
export async function searchCode(
  query: string,
  options: { repo?: string; language?: string; limit?: number } = {},
  accessToken?: string
): Promise<Array<{ path: string; repository: string; htmlUrl: string; score: number }>> {
  const { repo, language, limit = 10 } = options;

  let searchQuery = query;
  if (repo) {searchQuery += ` repo:${repo}`;}
  if (language) {searchQuery += ` language:${language}`;}

  const response = await axios.get(`${GITHUB_API_BASE}/search/code`, {
    headers: getAuthHeaders(accessToken),
    params: {
      q: searchQuery,
      per_page: limit,
    },
  });

  return response.data.items.map((item: {
    path: string;
    repository: { full_name: string };
    html_url: string;
    score: number;
  }) => ({
    path: item.path,
    repository: item.repository.full_name,
    htmlUrl: item.html_url,
    score: item.score,
  }));
}

/**
 * Get user's repositories
 */
export async function listUserRepositories(
  options: { type?: 'all' | 'owner' | 'member'; limit?: number; sort?: 'updated' | 'pushed' | 'full_name' } = {},
  accessToken?: string
): Promise<GitHubRepository[]> {
  const { type = 'owner', limit = 30, sort = 'updated' } = options;

  const response = await axios.get(`${GITHUB_API_BASE}/user/repos`, {
    headers: getAuthHeaders(accessToken),
    params: {
      type,
      sort,
      direction: 'desc',
      per_page: limit,
    },
  });

  return response.data.map(mapRepository);
}

// ===========================================
// Mapping Functions
// ===========================================

function mapRepository(data: Record<string, unknown>): GitHubRepository {
  return {
    id: data.id as number,
    name: data.name as string,
    fullName: data.full_name as string,
    description: data.description as string | null,
    private: data.private as boolean,
    htmlUrl: data.html_url as string,
    language: data.language as string | null,
    stargazersCount: data.stargazers_count as number,
    forksCount: data.forks_count as number,
    openIssuesCount: data.open_issues_count as number,
    defaultBranch: data.default_branch as string,
    updatedAt: data.updated_at as string,
  };
}

function mapIssue(data: Record<string, unknown>): GitHubIssue {
  return {
    id: data.id as number,
    number: data.number as number,
    title: data.title as string,
    body: data.body as string | null,
    state: data.state as 'open' | 'closed',
    htmlUrl: data.html_url as string,
    user: { login: (data.user as { login: string }).login },
    labels: (data.labels as Array<{ name: string; color: string }>).map(l => ({
      name: l.name,
      color: l.color,
    })),
    assignees: (data.assignees as Array<{ login: string }>).map(a => ({
      login: a.login,
    })),
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

function mapPullRequest(data: Record<string, unknown>): GitHubPullRequest {
  return {
    id: data.id as number,
    number: data.number as number,
    title: data.title as string,
    body: data.body as string | null,
    state: data.merged_at ? 'merged' : (data.state as 'open' | 'closed'),
    htmlUrl: data.html_url as string,
    user: { login: (data.user as { login: string }).login },
    head: {
      ref: (data.head as { ref: string; sha: string }).ref,
      sha: (data.head as { ref: string; sha: string }).sha,
    },
    base: { ref: (data.base as { ref: string }).ref },
    draft: data.draft as boolean,
    mergeable: data.mergeable as boolean | null,
    additions: (data.additions as number) || 0,
    deletions: (data.deletions as number) || 0,
    changedFiles: (data.changed_files as number) || 0,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

// ===========================================
// Tool Output Formatters
// ===========================================

/**
 * Format repository for tool output
 */
export function formatRepository(repo: GitHubRepository): string {
  const parts: string[] = [];
  parts.push(`**${repo.fullName}**`);
  if (repo.description) {parts.push(`> ${repo.description}`);}
  parts.push(`⭐ ${repo.stargazersCount} | 🍴 ${repo.forksCount} | 📝 ${repo.openIssuesCount} issues`);
  if (repo.language) {parts.push(`Language: ${repo.language}`);}
  parts.push(`URL: ${repo.htmlUrl}`);
  return parts.join('\n');
}

/**
 * Format issue for tool output
 */
export function formatIssue(issue: GitHubIssue): string {
  const parts: string[] = [];
  parts.push(`**#${issue.number}: ${issue.title}** (${issue.state})`);
  if (issue.body) {parts.push(`> ${issue.body.slice(0, 200)}${issue.body.length > 200 ? '...' : ''}`);}
  if (issue.labels.length > 0) {
    parts.push(`Labels: ${issue.labels.map(l => l.name).join(', ')}`);
  }
  parts.push(`By: ${issue.user.login} | ${issue.htmlUrl}`);
  return parts.join('\n');
}

/**
 * Format pull request for tool output
 */
export function formatPullRequest(pr: GitHubPullRequest): string {
  const parts: string[] = [];
  const stateEmoji = pr.state === 'merged' ? '🟣' : pr.state === 'open' ? '🟢' : '🔴';
  parts.push(`${stateEmoji} **#${pr.number}: ${pr.title}**`);
  parts.push(`${pr.head.ref} → ${pr.base.ref}`);
  parts.push(`+${pr.additions} -${pr.deletions} | ${pr.changedFiles} files`);
  if (pr.body) {parts.push(`> ${pr.body.slice(0, 150)}${pr.body.length > 150 ? '...' : ''}`);}
  parts.push(`By: ${pr.user.login} | ${pr.htmlUrl}`);
  return parts.join('\n');
}

/**
 * Format search results for tool output
 */
export function formatSearchResults(results: GitHubSearchResult): string {
  if (results.items.length === 0) {
    return 'Keine Repositories gefunden.';
  }

  const parts: string[] = [];
  parts.push(`**${results.totalCount} Repositories gefunden:**\n`);

  for (const repo of results.items) {
    parts.push(`• **${repo.fullName}** ⭐${repo.stargazersCount}`);
    if (repo.description) {parts.push(`  ${repo.description.slice(0, 80)}${repo.description.length > 80 ? '...' : ''}`);}
  }

  return parts.join('\n');
}
