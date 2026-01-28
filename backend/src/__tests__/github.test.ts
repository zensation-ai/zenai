/**
 * GitHub Service Tests
 */

import {
  isGitHubAvailable,
  formatRepository,
  formatIssue,
  formatPullRequest,
  formatSearchResults,
  GitHubRepository,
  GitHubIssue,
  GitHubPullRequest,
  GitHubSearchResult,
} from '../services/github';

describe('GitHub Service', () => {
  describe('isGitHubAvailable', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should return false without credentials', () => {
      delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      delete process.env.GITHUB_CLIENT_ID;
      delete process.env.GITHUB_CLIENT_SECRET;
      expect(isGitHubAvailable()).toBe(false);
    });

    it('should return true with personal access token', () => {
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN = 'ghp_test123';
      expect(isGitHubAvailable()).toBe(true);
    });

    it('should return true with OAuth credentials', () => {
      delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      process.env.GITHUB_CLIENT_ID = 'client123';
      process.env.GITHUB_CLIENT_SECRET = 'secret123';
      expect(isGitHubAvailable()).toBe(true);
    });
  });

  describe('formatRepository', () => {
    it('should format repository correctly', () => {
      const repo: GitHubRepository = {
        id: 1,
        name: 'test-repo',
        fullName: 'owner/test-repo',
        description: 'A test repository',
        private: false,
        htmlUrl: 'https://github.com/owner/test-repo',
        language: 'TypeScript',
        stargazersCount: 100,
        forksCount: 25,
        openIssuesCount: 10,
        defaultBranch: 'main',
        updatedAt: '2026-01-28T00:00:00Z',
      };

      const formatted = formatRepository(repo);
      expect(formatted).toContain('**owner/test-repo**');
      expect(formatted).toContain('A test repository');
      expect(formatted).toContain('⭐ 100');
      expect(formatted).toContain('TypeScript');
      expect(formatted).toContain('https://github.com/owner/test-repo');
    });

    it('should handle repository without description', () => {
      const repo: GitHubRepository = {
        id: 1,
        name: 'test-repo',
        fullName: 'owner/test-repo',
        description: null,
        private: false,
        htmlUrl: 'https://github.com/owner/test-repo',
        language: null,
        stargazersCount: 0,
        forksCount: 0,
        openIssuesCount: 0,
        defaultBranch: 'main',
        updatedAt: '2026-01-28T00:00:00Z',
      };

      const formatted = formatRepository(repo);
      expect(formatted).toContain('**owner/test-repo**');
      expect(formatted).not.toContain('> ');
    });
  });

  describe('formatIssue', () => {
    it('should format issue correctly', () => {
      const issue: GitHubIssue = {
        id: 1,
        number: 42,
        title: 'Bug: Something is broken',
        body: 'This is a description of the bug that needs to be fixed.',
        state: 'open',
        htmlUrl: 'https://github.com/owner/repo/issues/42',
        user: { login: 'testuser' },
        labels: [
          { name: 'bug', color: 'd73a4a' },
          { name: 'priority:high', color: 'ff0000' },
        ],
        assignees: [{ login: 'developer' }],
        createdAt: '2026-01-28T00:00:00Z',
        updatedAt: '2026-01-28T00:00:00Z',
      };

      const formatted = formatIssue(issue);
      expect(formatted).toContain('#42');
      expect(formatted).toContain('Bug: Something is broken');
      expect(formatted).toContain('open');
      expect(formatted).toContain('bug');
      expect(formatted).toContain('testuser');
    });

    it('should truncate long body', () => {
      const longBody = 'A'.repeat(300);
      const issue: GitHubIssue = {
        id: 1,
        number: 1,
        title: 'Test',
        body: longBody,
        state: 'open',
        htmlUrl: 'https://github.com/owner/repo/issues/1',
        user: { login: 'user' },
        labels: [],
        assignees: [],
        createdAt: '2026-01-28T00:00:00Z',
        updatedAt: '2026-01-28T00:00:00Z',
      };

      const formatted = formatIssue(issue);
      expect(formatted).toContain('...');
      expect(formatted.length).toBeLessThan(longBody.length + 100);
    });
  });

  describe('formatPullRequest', () => {
    it('should format open PR correctly', () => {
      const pr: GitHubPullRequest = {
        id: 1,
        number: 123,
        title: 'Add new feature',
        body: 'This PR adds a great new feature',
        state: 'open',
        htmlUrl: 'https://github.com/owner/repo/pull/123',
        user: { login: 'developer' },
        head: { ref: 'feature-branch', sha: 'abc123' },
        base: { ref: 'main' },
        draft: false,
        mergeable: true,
        additions: 100,
        deletions: 20,
        changedFiles: 5,
        createdAt: '2026-01-28T00:00:00Z',
        updatedAt: '2026-01-28T00:00:00Z',
      };

      const formatted = formatPullRequest(pr);
      expect(formatted).toContain('🟢'); // Open PR emoji
      expect(formatted).toContain('#123');
      expect(formatted).toContain('feature-branch');
      expect(formatted).toContain('main');
      expect(formatted).toContain('+100');
      expect(formatted).toContain('-20');
    });

    it('should format merged PR with purple emoji', () => {
      const pr: GitHubPullRequest = {
        id: 1,
        number: 100,
        title: 'Merged PR',
        body: null,
        state: 'merged',
        htmlUrl: 'https://github.com/owner/repo/pull/100',
        user: { login: 'user' },
        head: { ref: 'branch', sha: 'def456' },
        base: { ref: 'main' },
        draft: false,
        mergeable: null,
        additions: 50,
        deletions: 10,
        changedFiles: 3,
        createdAt: '2026-01-28T00:00:00Z',
        updatedAt: '2026-01-28T00:00:00Z',
      };

      const formatted = formatPullRequest(pr);
      expect(formatted).toContain('🟣'); // Merged PR emoji
    });
  });

  describe('formatSearchResults', () => {
    it('should format empty results', () => {
      const results: GitHubSearchResult = {
        totalCount: 0,
        items: [],
      };

      const formatted = formatSearchResults(results);
      expect(formatted).toContain('Keine Repositories gefunden');
    });

    it('should format search results', () => {
      const results: GitHubSearchResult = {
        totalCount: 100,
        items: [
          {
            id: 1,
            name: 'react',
            fullName: 'facebook/react',
            description: 'A declarative JavaScript library',
            private: false,
            htmlUrl: 'https://github.com/facebook/react',
            language: 'JavaScript',
            stargazersCount: 200000,
            forksCount: 40000,
            openIssuesCount: 1000,
            defaultBranch: 'main',
            updatedAt: '2026-01-28T00:00:00Z',
          },
          {
            id: 2,
            name: 'vue',
            fullName: 'vuejs/vue',
            description: 'Progressive JavaScript framework',
            private: false,
            htmlUrl: 'https://github.com/vuejs/vue',
            language: 'TypeScript',
            stargazersCount: 150000,
            forksCount: 30000,
            openIssuesCount: 500,
            defaultBranch: 'main',
            updatedAt: '2026-01-28T00:00:00Z',
          },
        ],
      };

      const formatted = formatSearchResults(results);
      expect(formatted).toContain('100 Repositories gefunden');
      expect(formatted).toContain('facebook/react');
      expect(formatted).toContain('vuejs/vue');
      expect(formatted).toContain('⭐200000');
    });
  });
});
