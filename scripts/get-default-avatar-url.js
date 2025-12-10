// Script para verificar la URL exacta de la imagen default en Cloudinary
require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function getDefaultAvatarUrl() {
  try {
    console.log('\n🔍 Buscando la imagen default-avatar en Cloudinary...\n');
    
    // Obtener información del recurso
    const result = await cloudinary.api.resource('trifobet/avatars/default-avatar');
    
    console.log('✅ ¡Imagen encontrada!\n');
    console.log('📋 Información completa:');
    console.log('   URL Segura:', result.secure_url);
    console.log('   Public ID:', result.public_id);
    console.log('   Formato:', result.format);
    console.log('   Versión:', result.version);
    console.log('   Creada:', new Date(result.created_at));
    console.log('\n📝 USA ESTA URL EN TU .env:\n');
    console.log(`DEFAULT_PROFILE_PHOTO_URL=${result.secure_url}`);
    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.error && error.error.http_code === 404) {
      console.log('\n🔍 La imagen no existe. Intentando buscar todas las imágenes en trifobet/avatars/...\n');
      
      try {
        const list = await cloudinary.api.resources({
          type: 'upload',
          prefix: 'trifobet/avatars/',
          max_results: 10
        });
        
        console.log('Imágenes encontradas en trifobet/avatars/:');
        list.resources.forEach(img => {
          console.log(`  - ${img.public_id}`);
          console.log(`    URL: ${img.secure_url}`);
        });
      } catch (listError) {
        console.error('Error buscando imágenes:', listError.message);
      }
    }
  }
}

getDefaultAvatarUrl();
