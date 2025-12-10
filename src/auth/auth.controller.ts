// src/auth/auth.controller.ts
import { Controller, Post, Body, Get, UseGuards, Request, HttpCode } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    /**
     * Endpoint para registrar un nuevo usuario
     * POST /auth/register
     */
    @Post('register')
    async register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    /**
     * Endpoint para iniciar sesión
     * POST /auth/login
     * Acepta: { correo, contrasena } o { nombreUsuario, contrasena }
     */
    @Post('login')
    @HttpCode(200)  // ← IMPORTANTE: Asegurar que devuelve 200
    async login(@Body() loginDto: LoginDto) {
        // Flutter envía correo O nombreUsuario
        const identifier = loginDto.correo || loginDto.nombreUsuario;

        if (!identifier) {
            throw new Error('Debe proporcionar correo o nombreUsuario');
        }

        console.log('\n🔵 CONTROLLER - Procesando login...');
        const result = await this.authService.login(identifier, loginDto.contrasena);
        console.log('🔵 CONTROLLER - Login exitoso, devolviendo respuesta al cliente\n');

        return result;
    }

    /**
     * Endpoint para validar el token del usuario autenticado
     * GET /auth/me
     */
    @Get('me')
    @UseGuards(AuthGuard('jwt'))
    async getProfile(@Request() req) {
        return req.user;
    }
}
