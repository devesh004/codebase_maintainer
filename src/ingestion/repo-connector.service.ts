import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileData {
  filePath: string;
  content: string;
}

@Injectable()
export class RepoConnectorService {
  private readonly logger = new Logger(RepoConnectorService.name);

  // Common folders and extensions to ignore
  private readonly IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.idea', '.vscode', 'coverage']);
  private readonly IGNORED_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
    '.mp4', '.mp3', '.pdf', '.zip', '.tar', '.gz',
    '.DS_Store', '.woff', '.woff2', '.ttf', '.eot', '.lock'
  ]);

  async readDirectory(dirPath: string): Promise<FileData[]> {
    const results: FileData[] = [];
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (!this.IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            const subResults = await this.readDirectory(fullPath);
            results.push(...subResults);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!this.IGNORED_EXTENSIONS.has(ext) && entry.name !== 'package-lock.json') {
            try {
              const content = await fs.readFile(fullPath, 'utf8');
              results.push({ filePath: fullPath, content });
            } catch (err) {
              this.logger.warn(`Failed to read file ${fullPath}: ${(err as Error).message}`);
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error reading directory ${dirPath}`, error);
      throw error;
    }

    return results;
  }
}
