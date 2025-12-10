// src/perfil/perfil.controller.ts
import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PerfilService } from './perfil.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('perfil')
@UseGuards(AuthGuard('jwt'))
export class PerfilController {
  constructor(private readonly perfilService: PerfilService) { }

  @Get('me')
  getProfile(@CurrentUser() user: any) {
    return this.perfilService.getProfile(user.userId);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.perfilService.updateProfile(user.userId, dto);
  }

  @Patch('me/photo')
  @UseInterceptors(
    FileInterceptor('foto', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png|webp)$/i)) {
          return cb(new BadRequestException('Solo imágenes'), false);
        }
        cb(null, true);
      },
    }),
  )
  updatePhoto(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Falta la foto');
    return this.perfilService.updateProfilePhoto(user.userId, file);
  }

  @Delete('me/photo')
  deletePhoto(@CurrentUser() user: any) {
    return this.perfilService.deleteProfilePhoto(user.userId);
  }
}