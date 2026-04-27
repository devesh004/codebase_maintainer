import { Injectable } from '@nestjs/common';

export interface FileRef {
  file: string;
  line?: number;
}

export interface ParsedError {
  errorType: string;
  errorMessage: string;
  fileReferences: FileRef[];
  rawTrace: string;
}

@Injectable()
export class StackTraceParserService {
  parse(input: string): ParsedError {
    const lines = input.split('\n').map(l => l.trim()).filter(Boolean);

    // First line is usually "ErrorType: message"
    const errorLineMatch = lines[0]?.match(/^(\w*(?:Error|Exception|Fault|Warning))[:\s]+(.*)/i);
    const errorType = errorLineMatch?.[1] || 'Error';
    const errorMessage = errorLineMatch?.[2]?.trim() || lines[0] || input;

    const fileRefs: FileRef[] = [];
    const seen = new Set<string>();

    const stackPatterns: RegExp[] = [
      /at\s+\S+\s+\((.+?):(\d+):\d+\)/,       // Node: at func (file.ts:10:5)
      /at\s+(.+?):(\d+):\d+/,                    // Node: at file.ts:10:5
      /File\s+"(.+?)",\s+line\s+(\d+)/,          // Python: File "file.py", line 10
      /(\S+\.(ts|js|jsx|tsx|py|go|java|rb|rs)):(\d+)/,  // generic file:line
    ];

    for (const line of lines) {
      for (const pattern of stackPatterns) {
        const match = line.match(pattern);
        if (match) {
          // Last pattern has 3 groups, others have 2
          const file = match[1];
          const lineNum = match[2] ? parseInt(match[2], 10) : undefined;
          const key = `${file}:${lineNum}`;

          if (
            !seen.has(key) &&
            !file.includes('node_modules') &&
            !file.startsWith('node:') &&
            !file.startsWith('internal/')
          ) {
            seen.add(key);
            fileRefs.push({ file, line: lineNum });
          }
          break;
        }
      }
    }

    return { errorType, errorMessage, fileReferences: fileRefs, rawTrace: input };
  }
}
