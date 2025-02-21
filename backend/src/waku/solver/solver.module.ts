import { Module } from '@nestjs/common';
import { SolverService } from './solver.service.js';
import { UtilsService } from '../utils/utils.service.js';

@Module({
  providers: [SolverService, UtilsService],
})
export class SolverModule {}
