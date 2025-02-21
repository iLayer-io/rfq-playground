import { Controller, Get } from '@nestjs/common';
import { UserService } from './user.service.js';

/**
 * Controller responsible for handling user-related HTTP requests.
 */
@Controller('user')
export class UserController {
  /**
   * Creates an instance of UserController.
   *
   * @param {UserService} userService - Service handling user business logic.
   */
  constructor(private readonly userService: UserService) {}

  /**
   * HTTP GET endpoint to trigger the sending of a request via the Waku protocol.
   *
   * @returns {Promise<void>} A promise that resolves when the request has been sent.
   */
  @Get('/waku/send-request')
  async sendMessage(): Promise<void> {
    return await this.userService.sendRequest();
  }
}
