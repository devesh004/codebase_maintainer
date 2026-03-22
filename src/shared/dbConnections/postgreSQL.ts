import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
    user: process.env.DB_USER_NAME,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: 5432,
    ssl: {
        rejectUnauthorized: false,
    },
});

export const connectToDB = async () => {
    try {
        const client = await pool.connect();
        console.log('Successfully connected to PostgreSQL database');

        // Initialize tables on startup
        await client.query(`
            CREATE TABLE IF NOT EXISTS ChatMessage (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL, -- 'user' or 'assistant'
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON ChatMessage(session_id);
        `);
        console.log('PostgreSQL schema initialized for ChatMessage');

        client.release();
    } catch (error) {
        console.error('Error connecting to PostgreSQL database:', error);
    }
};
