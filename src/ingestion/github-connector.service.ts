import { Injectable, Logger } from '@nestjs/common';
import { FileData } from './repo-connector.service';
import * as path from 'path';

interface GitTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

interface GitTreeResponse {
  tree: GitTreeEntry[];
  truncated: boolean;
}

interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  branch: string | null; // null means "use default"
}

@Injectable()
export class GitHubConnectorService {
  private readonly logger = new Logger(GitHubConnectorService.name);

  private readonly IGNORED_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', '.idea', '.vscode', 'coverage',
  ]);

  private readonly IGNORED_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
    '.mp4', '.mp3', '.pdf', '.zip', '.tar', '.gz',
    '.DS_Store', '.woff', '.woff2', '.ttf', '.eot', '.lock',
  ]);

  // Delay between individual blob fetches to avoid secondary rate limits
  private readonly FETCH_DELAY_MS = 50;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async readFromGitHub(repoUrl: string): Promise<FileData[]> {
    const parsed = this.parseGitHubUrl(repoUrl);
    this.logger.log(
      `Fetching GitHub repo: ${parsed.owner}/${parsed.repo}` +
      (parsed.branch ? ` @ ${parsed.branch}` : ''),
    );

    const branch = await this.resolveBranch(parsed);
    this.logger.log(`Using branch: ${branch}`);

    const tree = await this.fetchTree(parsed.owner, parsed.repo, branch);

    if (tree.truncated) {
      this.logger.warn(
        'GitHub returned a truncated tree — very large repos may be partially ingested.',
      );
    }

    const fileEntries = tree.tree.filter(
      (entry) => entry.type === 'blob' && this.shouldInclude(entry.path),
    );

    this.logger.log(
      `Found ${fileEntries.length} eligible files out of ${tree.tree.length} tree entries.`,
    );

    const files: FileData[] = [];

    for (let i = 0; i < fileEntries.length; i++) {
      const entry = fileEntries[i];
      try {
        const content = await this.fetchBlobContent(
          parsed.owner,
          parsed.repo,
          entry.sha,
        );
        // Use a virtual path that mirrors the repo structure
        files.push({
          filePath: `${parsed.owner}/${parsed.repo}/${entry.path}`,
          content,
        });
      } catch (err) {
        this.logger.warn(
          `Skipping ${entry.path}: ${(err as Error).message}`,
        );
      }

      // Small delay to stay within GitHub's secondary rate limits
      if (i < fileEntries.length - 1) {
        await this.delay(this.FETCH_DELAY_MS);
      }
    }

    this.logger.log(`Successfully fetched ${files.length} files from GitHub.`);
    return files;
  }

  // -------------------------------------------------------------------------
  // URL parsing
  // -------------------------------------------------------------------------

  /**
   * Supports:
   *   https://github.com/owner/repo
   *   https://github.com/owner/repo/
   *   https://github.com/owner/repo/tree/branch-name
   *   github.com/owner/repo  (no protocol)
   */
  parseGitHubUrl(url: string): ParsedGitHubUrl {
    // Normalise — strip protocol if present
    const cleaned = url.replace(/^https?:\/\//, '').replace(/^github\.com\//, '');
    const parts = cleaned.split('/').filter(Boolean);

    if (parts.length < 2) {
      throw new Error(`Invalid GitHub URL: "${url}". Expected format: https://github.com/owner/repo`);
    }

    const [owner, repo, maybeTree, branch] = parts;

    return {
      owner,
      repo: repo.replace(/\.git$/, ''),
      branch: maybeTree === 'tree' && branch ? branch : null,
    };
  }

  // -------------------------------------------------------------------------
  // GitHub API helpers
  // -------------------------------------------------------------------------

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const token = process.env.GITHUB_TOKEN;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  private async githubFetch<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: this.buildHeaders() });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `GitHub API error ${response.status} for ${url}: ${body}`,
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * If the URL didn't specify a branch, try 'main' then fall back to 'master'.
   */
  private async resolveBranch(parsed: ParsedGitHubUrl): Promise<string> {
    if (parsed.branch) return parsed.branch;

    for (const candidate of ['main', 'master']) {
      const url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/refs/heads/${candidate}`;
      try {
        await this.githubFetch(url);
        return candidate;
      } catch {
        // try next candidate
      }
    }

    // Last resort: ask for the repo's default_branch
    const repoUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
    const repoInfo = await this.githubFetch<{ default_branch: string }>(repoUrl);
    return repoInfo.default_branch;
  }

  private async fetchTree(owner: string, repo: string, branch: string): Promise<GitTreeResponse> {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    return this.githubFetch<GitTreeResponse>(url);
  }

  private async fetchBlobContent(owner: string, repo: string, sha: string): Promise<string> {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`;
    const blob = await this.githubFetch<{ content: string; encoding: string }>(url);

    if (blob.encoding !== 'base64') {
      throw new Error(`Unexpected blob encoding: ${blob.encoding}`);
    }

    return Buffer.from(blob.content, 'base64').toString('utf8');
  }

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------

  private shouldInclude(filePath: string): boolean {
    const parts = filePath.split('/');

    // Reject if any path segment matches an ignored directory
    for (const segment of parts.slice(0, -1)) {
      if (this.IGNORED_DIRS.has(segment) || segment.startsWith('.')) {
        return false;
      }
    }

    const filename = parts[parts.length - 1];

    if (filename === 'package-lock.json') return false;

    const ext = path.extname(filename).toLowerCase();
    if (this.IGNORED_EXTENSIONS.has(ext)) return false;

    return true;
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
