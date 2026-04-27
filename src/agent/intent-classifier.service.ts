import { Injectable } from '@nestjs/common';

export type QueryMode = 'simple' | 'agentic' | 'debug';

@Injectable()
export class IntentClassifierService {
  classify(query: string): QueryMode {
    const debugPatterns = [
      /\berror:/i,
      /\bexception:/i,
      /TypeError/,
      /ReferenceError/,
      /SyntaxError/,
      /RangeError/,
      /\btraceback\b/i,
      /stack trace/i,
      /at\s+\S+\s+\(\S+:\d+:\d+\)/,    // Node.js stack frame
      /File\s+"[^"]+",\s+line\s+\d+/,   // Python traceback
      /undefined is not/i,
      /cannot read prop/i,
      /cannot set prop/i,
      /\w+\.(ts|js|py|go|java):\d+/,    // file:line reference
      /\bENOENT\b/,
      /\bECONNREFUSED\b/,
      /null pointer/i,
      /segmentation fault/i,
      /\bfailed with exit code\b/i,
    ];

    const agenticPatterns = [
      /explain\s+(the\s+)?(entire|full|whole|complete)/i,
      /explain\s+(how|what|why).+flow/i,
      /how does.+(work|function|process)/i,
      /trace\s+(the\s+)?flow/i,
      /walk me through/i,
      /end.?to.?end/i,
      /step.?by.?step/i,
      /give me an?\s+overview/i,
      /\barchitecture\b/i,
      /\blifecycle\b/i,
      /\bpipeline\b/i,
      /what happens when/i,
      /from start to/i,
      /how (is|are|does).+connected/i,
    ];

    for (const pattern of debugPatterns) {
      if (pattern.test(query)) return 'debug';
    }

    for (const pattern of agenticPatterns) {
      if (pattern.test(query)) return 'agentic';
    }

    return 'simple';
  }
}
