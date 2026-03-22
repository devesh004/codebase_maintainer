import { Injectable, Logger } from '@nestjs/common';
import { pool } from '../shared/dbConnections/postgreSQL';

export interface ChatMessage {
    id: number;
    sessionId: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: Date;
}

@Injectable()
export class ChatRepository {
    private readonly logger = new Logger(ChatRepository.name);

    async getMessagesBySessionId(sessionId: string): Promise<ChatMessage[]> {
        try {
            const result = await pool.query(
                `SELECT id, session_id as "sessionId", role, content, created_at as "createdAt"
                 FROM ChatMessage 
                 WHERE session_id = $1 
                 ORDER BY created_at ASC`,
                [sessionId]
            );
            return result.rows as ChatMessage[];
        } catch (error) {
            this.logger.error(`Error fetching messages for session ${sessionId}:`, error);
            return [];
        }
    }

    async saveMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
        try {
            await pool.query(
                `INSERT INTO ChatMessage (session_id, role, content) VALUES ($1, $2, $3)`,
                [sessionId, role, content]
            );
        } catch (error) {
            this.logger.error(`Error saving message for session ${sessionId}:`, error);
        }
    }
}
