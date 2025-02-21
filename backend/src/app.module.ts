import { Module } from '@nestjs/common';
import { SolverModule } from './waku/solver/solver.module.js';
import { UserModule } from './waku/user/user.module.js';

@Module({
  imports: [SolverModule, UserModule],
})
export class AppModule {}
