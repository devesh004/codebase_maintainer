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
        
        // Initialize ProjectContext table if it doesn't exist
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
        
        client.release();
    } catch (error) {
        console.error('Error connecting to PostgreSQL:', error);
    }
};
