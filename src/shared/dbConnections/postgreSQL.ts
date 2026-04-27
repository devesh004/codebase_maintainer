import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
    user: process.env.DB_USER_NAME,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: 5432,
    ssl: { rejectUnauthorized: false },
});

export const connectToDB = async () => {
    try {
        const client = await pool.connect();
        console.log('Successfully connected to PostgreSQL');
        
        // ProjectContext table
        await client.query(`
            CREATE TABLE IF NOT EXISTS ProjectContext (
                id SERIAL PRIMARY KEY,
                namespace VARCHAR(255) UNIQUE NOT NULL,
                project_name VARCHAR(255) NOT NULL,
                files_processed INT DEFAULT 0,
                summary TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('ProjectContext table verified/created');

        // ChatMessage table (conversation history)
        await client.query(`
            CREATE TABLE IF NOT EXISTS ChatMessage (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON ChatMessage(session_id)
        `);
        console.log('ChatMessage table verified/created');

        // AgentTrace table (reasoning traces for agentic/debug sessions)
        await client.query(`
            CREATE TABLE IF NOT EXISTS AgentTrace (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(255) NOT NULL,
                mode VARCHAR(50) NOT NULL,
                plan JSONB,
                steps JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_agent_trace_session_id ON AgentTrace(session_id)
        `);
        console.log('AgentTrace table verified/created');
        
        client.release();
    } catch (error) {
        console.error('Error connecting to PostgreSQL:', error);
    }
};
