import { Injectable, Logger } from '@nestjs/common';
import { pool } from '../shared/dbConnections/postgreSQL';

export interface ProjectContext {
    id: number;
    namespace: string;
    projectName: string;
    filesProcessed: number;
    summary: string;
    createdAt: Date;
    updatedAt: Date;
}

@Injectable()
export class ProjectRepository {
    private readonly logger = new Logger(ProjectRepository.name);

    async upsertProjectContext(
        namespace: string,
        projectName: string,
        filesProcessed: number,
        summary: string
    ): Promise<void> {
        try {
            await pool.query(
                `INSERT INTO ProjectContext (namespace, project_name, files_processed, summary) 
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (namespace) 
                 DO UPDATE SET 
                    project_name = EXCLUDED.project_name,
                    files_processed = EXCLUDED.files_processed,
                    summary = EXCLUDED.summary,
                    updated_at = CURRENT_TIMESTAMP`,
                [namespace, projectName, filesProcessed, summary]
            );
            this.logger.log(`Upserted project context for namespace: ${namespace}`);
        } catch (error) {
            this.logger.error(`Error upserting project context for namespace ${namespace}:`, error);
        }
    }

    async getProjectContext(namespace: string): Promise<ProjectContext | null> {
        try {
            const result = await pool.query(
                `SELECT 
                    id, 
                    namespace, 
                    project_name as "projectName", 
                    files_processed as "filesProcessed", 
                    summary, 
                    created_at as "createdAt", 
                    updated_at as "updatedAt"
                 FROM ProjectContext 
                 WHERE namespace = $1`,
                [namespace]
            );
            return result.rows.length > 0 ? (result.rows[0] as ProjectContext) : null;
        } catch (error) {
            this.logger.error(`Error fetching project context for namespace ${namespace}:`, error);
            return null;
        }
    }

    async getAllProjects(): Promise<ProjectContext[]> {
        try {
            const result = await pool.query(
                `SELECT 
                    id, 
                    namespace, 
                    project_name as "projectName", 
                    files_processed as "filesProcessed", 
                    summary, 
                    created_at as "createdAt", 
                    updated_at as "updatedAt"
                 FROM ProjectContext 
                 ORDER BY updated_at DESC`
            );
            return result.rows as ProjectContext[];
        } catch (error) {
            this.logger.error(`Error fetching all projects:`, error);
            return [];
        }
    }
}
