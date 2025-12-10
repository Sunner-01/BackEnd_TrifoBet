// Script para subir la imagen de perfil predeterminada a Cloudinary
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';
import * as path from 'path';

// Configurar Cloudinary

const avatarPath = path.join(process.cwd(), '..', '..', '..', '.gemini', 'antigravity', 'brain', 'fbe1af55-ad2e-403c-b519-e97486c50e9a', 'default_avatar_1763768589876.png');

async function uploadDefaultAvatar() {
    try {
        console.log('📤 Subiendo imagen predeterminada a Cloudinary...\n');
        console.log('Ruta de la imagen:', avatarPath);

        if (!fs.existsSync(avatarPath)) {
            console.error('❌ Error: No se encontró la imagen en la ruta especificada');
            process.exit(1);
        }

        const result = await cloudinary.uploader.upload(avatarPath, {
            folder: 'trifobet/avatars',
            public_id: 'default-avatar',
            overwrite: true,
            transformation: [
                { width: 400, height: 400, crop: 'fill', gravity: 'center' },
                { quality: 'auto', fetch_format: 'auto' }
            ],
        });

        console.log('✅ ¡Imagen subida exitosamente!\n');
        console.log('📋 Información de la imagen:');
        console.log('   URL:', result.secure_url);
        console.log('   Public ID:', result.public_id);
        console.log('   Formato:', result.format);
        console.log('   Tamaño:', result.bytes, 'bytes');
        console.log('\n📝 Agrega esta línea a tu archivo .env:\n');
        console.log(`DEFAULT_PROFILE_PHOTO_URL=${result.secure_url}`);
        console.log('\n');

    } catch (error: any) {
        console.error('❌ Error al subir la imagen:', error.message);
        process.exit(1);
    }
}

uploadDefaultAvatar();
