import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IsEmail, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards';

class CredentialsDto {
  @IsEmail()
  email: string;

  @MinLength(6)
  password: string;
}

class ChangePasswordDto {
  @MinLength(1)
  oldPassword: string;

  @MinLength(6)
  newPassword: string;
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

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(@Req() req: { user: { id: number } }, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.user.id, dto.oldPassword, dto.newPassword);
  }
}
