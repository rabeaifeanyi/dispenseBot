import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  @Post('admin/login')
  adminLogin(@Body('password') password: string) {
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      throw new UnauthorizedException(
        'Admin-Passwort nicht konfiguriert (ADMIN_PASSWORD fehlt)'
      );
    }

    if (password !== adminPassword) {
      throw new UnauthorizedException('Falsches Passwort');
    }

    return { ok: true };
  }
}
