// Script para subir la imagen de perfil predeterminada a Cloudinary
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configurar Cloudinary desde las variables de entorno
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const avatarPath = path.join(__dirname, 'default-avatar.jpg');

async function uploadDefaultAvatar() {
  try {
    console.log('📤 Subiendo imagen predeterminada a Cloudinary...\n');
    console.log('Ruta de la imagen:', avatarPath);
    console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
    
    if (!fs.existsSync(avatarPath)) {
      console.error('❌ Error: No se encontró la imagen en la ruta especificada');
      console.error('Buscando en:', avatarPath);
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

  } catch (error) {
    console.error('❌ Error al subir la imagen:', error.message);
    if (error.http_code) {
      console.error('HTTP Code:', error.http_code);
    }
    process.exit(1);
  }
}

uploadDefaultAvatar();
