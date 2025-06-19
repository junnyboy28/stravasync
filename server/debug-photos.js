const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function debugPhotos() {
  try {
    // Get all photos
    const photos = await prisma.photo.findMany({
      include: { activity: true }
    });
    
    console.log(`Found ${photos.length} photos in database`);
    
    // Log each photo
    photos.forEach(photo => {
      console.log(`
Photo ID: ${photo.id}
Activity ID: ${photo.activityId}
Activity Name: ${photo.activity.name}
URL: ${photo.url}
Strava ID: ${photo.stravaId ? photo.stravaId.toString() : 'null'}
Is Primary: ${photo.isPrimary}
---------------------------------------------`);
    });
    
  } catch (error) {
    console.error("Error debugging photos:", error);
  } finally {
    await prisma.$disconnect();
  }
}

debugPhotos();