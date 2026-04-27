import { Injectable, Logger } from '@nestjs/common';
import { pool } from '../shared/dbConnections/postgreSQL';

export interface AgentTrace {
  id: number;
  sessionId: string;
  mode: 'simple' | 'agentic' | 'debug';
  plan: string[] | null;
  steps: object[] | null;
  createdAt: Date;
}

@Injectable()
export class AgentTraceRepository {
  private readonly logger = new Logger(AgentTraceRepository.name);

  async saveTrace(
    sessionId: string,
    mode: 'simple' | 'agentic' | 'debug',
    plan: string[] | null,
    steps: object[] | null,
  ): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO AgentTrace (session_id, mode, plan, steps)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, mode, JSON.stringify(plan), JSON.stringify(steps)],
      );
    } catch (error) {
      this.logger.error(`Error saving agent trace for session ${sessionId}:`, error);
    }
  }

  async getTraceBySessionId(sessionId: string): Promise<AgentTrace | null> {
    try {
      const result = await pool.query(
        `SELECT id, session_id as "sessionId", mode, plan, steps, created_at as "createdAt"
         FROM AgentTrace
         WHERE session_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [sessionId],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      this.logger.error(`Error fetching trace for session ${sessionId}:`, error);
      return null;
    }
  }
}
