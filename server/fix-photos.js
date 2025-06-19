const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function fixPhotoUrls() {
  try {
    // Get all photos
    const photos = await prisma.photo.findMany();
    console.log(`Found ${photos.length} photos in database`);
    
    // Fix URLs for photos that don't have full URLs
    for (const photo of photos) {
      if (!photo.url.startsWith('http')) {
        const newUrl = `http://localhost:3001${photo.url}`;
        console.log(`Updating photo URL from ${photo.url} to ${newUrl}`);
        
        await prisma.photo.update({
          where: { id: photo.id },
          data: { url: newUrl }
        });
      }
    }
    
    console.log('Photo URLs updated successfully');
  } catch (error) {
    console.error("Error fixing photo URLs:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fixPhotoUrls();