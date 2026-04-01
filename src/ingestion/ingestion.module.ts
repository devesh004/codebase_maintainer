import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { RepoConnectorService } from './repo-connector.service';
import { GitHubConnectorService } from './github-connector.service';
import { CodeParserService } from './code-parser.service';
import { VectorStorageService } from './vector-storage.service';
import { ProjectRepository } from './project.repository';
import { ProjectSummaryService } from './project-summary.service';

@Module({
  controllers: [IngestionController],
  providers: [
    RepoConnectorService, 
    GitHubConnectorService, 
    CodeParserService, 
    VectorStorageService,
    ProjectRepository,
    ProjectSummaryService
  ],
  exports: [VectorStorageService, ProjectRepository]
})
export class IngestionModule { }
