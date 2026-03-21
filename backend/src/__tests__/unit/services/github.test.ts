/**
 * GitHub Service Tests
 *
 * Tests for GitHub API integration: availability, OAuth, search,
 * repository info, issues, and pull requests.
 */

jest.mock('axios');
jest.mock('../../../utils/database', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import axios from 'axios';
import { pool } from '../../../utils/database';
import {
  isGitHubAvailable,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  storeTokens,
  getStoredTokens,
  getAuthenticatedUser,
  searchRepositories,
  getRepository,
  listIssues,
  createIssue,
  listPullRequests,
} from '../../../services/github';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedPool = pool as jest.Mocked<typeof pool>;

describe('GitHub Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN = 'ghp_test123';
    process.env.GITHUB_CLIENT_ID = 'client-id';
    process.env.GITHUB_CLIENT_SECRET = 'client-secret';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isGitHubAvailable', () => {
    it('should return true when PAT is set', () => {
      expect(isGitHubAvailable()).toBe(true);
    });

    it('should return true when client ID and secret are set', () => {
      delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      process.env.GITHUB_CLIENT_ID = 'cid';
      process.env.GITHUB_CLIENT_SECRET = 'csecret';

      expect(isGitHubAvailable()).toBe(true);
    });

    it('should return false when nothing is configured', () => {
      delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      delete process.env.GITHUB_CLIENT_ID;
      delete process.env.GITHUB_CLIENT_SECRET;

      expect(isGitHubAvailable()).toBe(false);
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct OAuth URL', () => {
      const url = getAuthorizationUrl('https://example.com/cb', 'state123');

      expect(url).toContain('github.com/login/oauth/authorize');
      expect(url).toContain('client_id=client-id');
      expect(url).toContain('state=state123');
      expect(url).toContain('redirect_uri=');
    });

    it('should throw if client_id is missing', () => {
      delete process.env.GITHUB_CLIENT_ID;

      expect(() => getAuthorizationUrl('https://cb', 'state'))
        .toThrow('GITHUB_CLIENT_ID not configured');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should exchange code for tokens', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'gho_abc', token_type: 'bearer', scope: 'repo' },
      });

      const tokens = await exchangeCodeForTokens('code123', 'https://cb');

      expect(tokens.accessToken).toBe('gho_abc');
      expect(tokens.tokenType).toBe('bearer');
      expect(tokens.scope).toBe('repo');
    });

    it('should throw on OAuth error', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { error: 'bad_verification_code', error_description: 'Invalid code' },
      });

      await expect(exchangeCodeForTokens('bad', 'https://cb'))
        .rejects.toThrow('GitHub OAuth error');
    });
  });

  describe('storeTokens / getStoredTokens', () => {
    it('should store tokens in DB', async () => {
      mockedPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

      await storeTokens('user-1', { accessToken: 'tok', tokenType: 'bearer', scope: 'repo' });

      expect(mockedPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_integrations'),
        expect.arrayContaining(['user-1', 'tok', 'repo'])
      );
    });

    it('should get stored tokens', async () => {
      mockedPool.query.mockResolvedValueOnce({ rows: [{ access_token: 'stored-tok' }] } as never);

      const token = await getStoredTokens('user-1');
      expect(token).toBe('stored-tok');
    });

    it('should return null when no tokens stored', async () => {
      mockedPool.query.mockResolvedValueOnce({ rows: [] } as never);

      const token = await getStoredTokens('user-1');
      expect(token).toBeNull();
    });
  });

  describe('getAuthenticatedUser', () => {
    it('should return mapped user data', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { id: 1, login: 'octocat', name: 'Octocat', email: 'cat@gh.com', avatar_url: 'https://img' },
      });

      const user = await getAuthenticatedUser();

      expect(user.login).toBe('octocat');
      expect(user.avatarUrl).toBe('https://img');
    });
  });

  describe('searchRepositories', () => {
    it('should search and map results', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          total_count: 1,
          items: [{
            id: 100, name: 'react', full_name: 'facebook/react',
            description: 'UI lib', private: false, html_url: 'https://github.com/facebook/react',
            language: 'JavaScript', stargazers_count: 200000, forks_count: 40000,
            open_issues_count: 1000, default_branch: 'main', updated_at: '2026-01-01',
          }],
        },
      });

      const result = await searchRepositories('react', { limit: 5 });

      expect(result.totalCount).toBe(1);
      expect(result.items[0].fullName).toBe('facebook/react');
    });
  });

  describe('getRepository', () => {
    it('should return mapped repository', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: 1, name: 'repo', full_name: 'owner/repo', description: 'desc',
          private: false, html_url: 'https://github.com/owner/repo',
          language: 'TypeScript', stargazers_count: 10, forks_count: 2,
          open_issues_count: 3, default_branch: 'main', updated_at: '2026-01-01',
        },
      });

      const repo = await getRepository('owner', 'repo');
      expect(repo.name).toBe('repo');
      expect(repo.language).toBe('TypeScript');
    });
  });

  describe('listIssues', () => {
    it('should filter out PRs from issues list', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: [
          {
            id: 1, number: 1, title: 'Bug', body: 'desc', state: 'open',
            html_url: 'https://gh', user: { login: 'dev' },
            labels: [], assignees: [], created_at: '2026-01-01', updated_at: '2026-01-01',
          },
          {
            id: 2, number: 2, title: 'PR', body: null, state: 'open',
            html_url: 'https://gh', user: { login: 'dev' },
            labels: [], assignees: [], created_at: '2026-01-01', updated_at: '2026-01-01',
            pull_request: { url: 'https://...' },
          },
        ],
      });

      const issues = await listIssues('owner', 'repo');

      expect(issues).toHaveLength(1);
      expect(issues[0].title).toBe('Bug');
    });
  });

  describe('createIssue', () => {
    it('should create and return mapped issue', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          id: 10, number: 5, title: 'New Bug', body: 'details', state: 'open',
          html_url: 'https://gh/5', user: { login: 'author' },
          labels: [{ name: 'bug', color: 'red' }], assignees: [],
          created_at: '2026-03-01', updated_at: '2026-03-01',
        },
      });

      const issue = await createIssue({
        owner: 'org', repo: 'project', title: 'New Bug', body: 'details',
      });

      expect(issue.number).toBe(5);
      expect(issue.title).toBe('New Bug');
    });
  });

  describe('listPullRequests', () => {
    it('should return mapped PRs', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: [{
          id: 1, number: 10, title: 'Feature', body: 'adds X', state: 'open',
          html_url: 'https://gh/10', user: { login: 'dev' },
          head: { ref: 'feature', sha: 'abc123' }, base: { ref: 'main' },
          draft: false, mergeable: true, additions: 50, deletions: 10,
          changed_files: 5, created_at: '2026-01-01', updated_at: '2026-01-01',
        }],
      });

      const prs = await listPullRequests('owner', 'repo');

      expect(prs).toHaveLength(1);
      expect(prs[0].additions).toBe(50);
    });
  });
});
