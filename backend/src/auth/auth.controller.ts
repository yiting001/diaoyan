import { Body, Controller, Post } from '@nestjs/common';
import { IsEmail, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

class CredentialsDto {
  @IsEmail()
  email: string;

  @MinLength(6)
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() dto: CredentialsDto) {
    return this.auth.register(dto.email, dto.password);
  }

  @Post('login')
  login(@Body() dto: CredentialsDto) {
    return this.auth.login(dto.email, dto.password);
  }
}
