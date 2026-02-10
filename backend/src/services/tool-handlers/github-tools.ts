/**
 * GitHub Tool Handlers
 *
 * Implements GitHub-related Claude Tool Use handlers:
 * - Repository search
 * - Issue creation and listing
 * - Repository info
 * - Pull Request summaries
 *
 * @module services/tool-handlers/github-tools
 */

import { logger } from '../../utils/logger';
import { ToolExecutionContext } from '../claude/tool-use';
import * as github from '../github';

/**
 * GitHub search repositories handler
 */
export async function handleGitHubSearch(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const query = input.query as string;
  const limit = Math.min((input.limit as number) || 5, 10);

  if (!query || typeof query !== 'string') {
    return 'Fehler: Keine Suchanfrage angegeben.';
  }

  if (!github.isGitHubAvailable()) {
    return 'GitHub-Integration nicht konfiguriert. Bitte GITHUB_PERSONAL_ACCESS_TOKEN setzen.';
  }

  logger.debug('Tool: github_search', { query, limit });

  try {
    const results = await github.searchRepositories(query, { limit });
    return github.formatSearchResults(results);
  } catch (error) {
    logger.error('Tool github_search failed', error instanceof Error ? error : undefined);
    return 'Fehler bei der GitHub-Suche. Bitte versuche es erneut.';
  }
}

/**
 * GitHub create issue handler
 */
export async function handleGitHubCreateIssue(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const owner = input.owner as string;
  const repo = input.repo as string;
  const title = input.title as string;
  const body = input.body as string | undefined;
  const labels = input.labels as string[] | undefined;

  if (!owner || !repo || !title) {
    return 'Fehler: owner, repo und title sind erforderlich.';
  }

  if (!github.isGitHubAvailable()) {
    return 'GitHub-Integration nicht konfiguriert.';
  }

  logger.debug('Tool: github_create_issue', { owner, repo, title });

  try {
    const issue = await github.createIssue({ owner, repo, title, body, labels });
    return `✅ Issue erstellt:\n${github.formatIssue(issue)}`;
  } catch (error) {
    logger.error('Tool github_create_issue failed', error instanceof Error ? error : undefined);
    return `Fehler beim Erstellen des Issues: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

/**
 * GitHub repository info handler
 */
export async function handleGitHubRepoInfo(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const owner = input.owner as string;
  const repo = input.repo as string;

  if (!owner || !repo) {
    return 'Fehler: owner und repo sind erforderlich.';
  }

  if (!github.isGitHubAvailable()) {
    return 'GitHub-Integration nicht konfiguriert.';
  }

  logger.debug('Tool: github_repo_info', { owner, repo });

  try {
    const repository = await github.getRepository(owner, repo);
    return github.formatRepository(repository);
  } catch (error) {
    logger.error('Tool github_repo_info failed', error instanceof Error ? error : undefined);
    return `Repository ${owner}/${repo} nicht gefunden oder kein Zugriff.`;
  }
}

/**
 * GitHub list issues handler
 */
export async function handleGitHubListIssues(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const owner = input.owner as string;
  const repo = input.repo as string;
  const state = (input.state as 'open' | 'closed' | 'all') || 'open';
  const limit = Math.min((input.limit as number) || 5, 20);

  if (!owner || !repo) {
    return 'Fehler: owner und repo sind erforderlich.';
  }

  if (!github.isGitHubAvailable()) {
    return 'GitHub-Integration nicht konfiguriert.';
  }

  logger.debug('Tool: github_list_issues', { owner, repo, state, limit });

  try {
    const issues = await github.listIssues(owner, repo, { state, limit });

    if (issues.length === 0) {
      return `Keine ${state === 'all' ? '' : state + 'en'} Issues in ${owner}/${repo} gefunden.`;
    }

    const parts: string[] = [`**Issues in ${owner}/${repo}** (${state}):\n`];
    for (const issue of issues) {
      parts.push(github.formatIssue(issue));
      parts.push('');
    }
    return parts.join('\n');
  } catch (error) {
    logger.error('Tool github_list_issues failed', error instanceof Error ? error : undefined);
    return `Fehler beim Abrufen der Issues.`;
  }
}

/**
 * GitHub PR summary handler
 */
export async function handleGitHubPRSummary(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const owner = input.owner as string;
  const repo = input.repo as string;
  const prNumber = input.pr_number as number;

  if (!owner || !repo || !prNumber) {
    return 'Fehler: owner, repo und pr_number sind erforderlich.';
  }

  if (!github.isGitHubAvailable()) {
    return 'GitHub-Integration nicht konfiguriert.';
  }

  logger.debug('Tool: github_pr_summary', { owner, repo, prNumber });

  try {
    const pr = await github.getPullRequest(owner, repo, prNumber);
    const files = await github.getPullRequestFiles(owner, repo, prNumber);

    const parts: string[] = [github.formatPullRequest(pr), '\n**Geänderte Dateien:**'];

    for (const file of files.slice(0, 10)) {
      parts.push(`• ${file.filename} (+${file.additions}/-${file.deletions}) [${file.status}]`);
    }

    if (files.length > 10) {
      parts.push(`... und ${files.length - 10} weitere Dateien`);
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool github_pr_summary failed', error instanceof Error ? error : undefined);
    return `PR #${prNumber} in ${owner}/${repo} nicht gefunden.`;
  }
}
