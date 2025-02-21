import { Module } from '@nestjs/common';
import { UserService } from './user.service.js';
import { UtilsService } from '../utils/utils.service.js';
import { UserController } from './user.controller.js';

@Module({
  providers: [UserService, UtilsService],
  controllers: [UserController],
})
export class UserModule {}
