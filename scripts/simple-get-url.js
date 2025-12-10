// Script simple para obtener URL de la imagen default
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

cloudinary.api.resource('trifobet/avatars/default-avatar')
  .then(result => {
    const url = result.secure_url;
    console.log(url);
    fs.writeFileSync('default-avatar-url.txt', url);
  })
  .catch(err => console.error('Error:', err.message));
