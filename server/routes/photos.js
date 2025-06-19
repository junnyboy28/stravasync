const express = require("express");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const verifyToken = require("../middleware/auth");
const router = express.Router();
const prisma = new PrismaClient();
const FormData = require('form-data');

// Set up multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept common image mime types
    const allowedMimeTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
      'image/bmp', 'image/webp', 'image/svg+xml'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // For debugging
      console.log(`Rejected file upload with mimetype: ${file.mimetype}`);
      cb(null, false);
      cb(new Error(`Only image files are allowed. Received: ${file.mimetype}`));
    }
  }
});

// Get photos for an activity
router.get("/activity/:activityId", verifyToken, async (req, res) => {
  try {
    const { activityId } = req.params;
    const { uid } = req.user;
    
    console.log(`Fetching photos for activity ID: ${activityId}`);
    
    // Debug: Check all photos in the database
    const allPhotos = await prisma.photo.findMany();
    console.log(`Total photos in database: ${allPhotos.length}`);
    allPhotos.forEach(p => {
      console.log(`Photo ID: ${p.id}, Activity ID: ${p.activityId}`);
    });
    
    // Get user from DB to verify ownership
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Find the activity first to verify ownership
    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
    });
    
    if (!activity) {
      console.log(`Activity not found with ID: ${activityId}`);
      return res.status(404).json({ message: "Activity not found" });
    }
    
    if (activity.userId !== user.id) {
      return res.status(403).json({ message: "You don't have permission to view photos for this activity" });
    }
    
    // Now get photos for this activity
    const photos = await prisma.photo.findMany({
      where: { activityId: activityId },
      orderBy: { isPrimary: 'desc' }
    });
    
    console.log(`Found ${photos.length} photos for activity ${activityId} in the database`);
    
    // Log each photo for debugging
    photos.forEach(photo => {
      console.log(`  Photo ID: ${photo.id}, URL: ${photo.url}, isPrimary: ${photo.isPrimary}`);
    });
    
    // Convert BigInt to String for JSON serialization
    const serializedPhotos = photos.map(photo => ({
      ...photo,
      stravaId: photo.stravaId ? photo.stravaId.toString() : null
    }));
    
    res.json(serializedPhotos);
  } catch (error) {
    console.error("Error fetching photos:", error);
    res.status(500).json({ 
      message: "Error fetching photos", 
      error: error.message 
    });
  }
});

// Upload photo to Strava and add to activity
router.post("/:activityId", verifyToken, (req, res) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      console.error("Multer upload error:", err);
      return res.status(400).json({ message: err.message });
    }
    
    // If no file was uploaded (might happen if file type was rejected)
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded or file type not supported" });
    }
    
    // Continue with photo upload logic after successful file upload
    handlePhotoUpload(req, res).catch(error => {
      console.error("Error in photo upload handler:", error);
      res.status(500).json({ 
        message: "Error uploading photo", 
        error: error.message 
      });
    });
  });
});

// Separate handler function for the upload logic
async function handlePhotoUpload(req, res) {
  const { uid } = req.user;
  const { activityId } = req.params;
  const { caption } = req.body;
  
  // Get the uploaded file
  const file = req.file;
  if (!file) {
    return res.status(400).json({ message: "No photo uploaded" });
  }
  
  console.log("Received file:", file);
  
  // Get user from DB
  const user = await prisma.user.findUnique({
    where: { firebaseUid: uid },
  });

  if (!user || !user.stravaToken) {
    return res.status(400).json({ message: "User not connected to Strava" });
  }

  // Get the activity to ensure it belongs to the user
  const activity = await prisma.activity.findUnique({
    where: { id: activityId }
  });

  if (!activity) {
    return res.status(404).json({ message: "Activity not found" });
  }

  if (activity.userId !== user.id) {
    return res.status(403).json({ message: "You don't have permission to add photos to this activity" });
  }

  // Check if token is expired and refresh if needed
  const now = Math.floor(Date.now() / 1000);
  let accessToken = user.stravaToken;

  if (user.expiresAt && user.expiresAt < now) {
    const response = await axios.post("https://www.strava.com/oauth/token", {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: user.refreshToken,
      grant_type: "refresh_token"
    });
    
    accessToken = response.data.access_token;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        stravaToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt: response.data.expires_at
      }
    });
  }

  // Skip Strava API upload for mock activities or if user specifically chooses local-only
  let stravaPhotoId = null;
  let photoUrl = '';
  
  // For all activities, always store the file locally first
  // Ensure uploads directory exists
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  
  // Generate a unique filename to avoid collisions
  const uniqueFilename = `${Date.now()}-${path.basename(file.path)}`;
  const localFilePath = path.join(uploadsDir, uniqueFilename);
  
  // Copy the uploaded file to the uploads directory
  fs.copyFileSync(file.path, localFilePath);
  console.log(`File copied to: ${localFilePath}`);
  
  // Set the URL to access the file - make sure the path matches what your server serves
  photoUrl = `http://localhost:3001/uploads/${uniqueFilename}`;
  
  // For non-mock activities, also try to upload to Strava (but don't fail if it doesn't work)
  if (!activity.isMock) {
    try {
      console.log("Attempting to upload to Strava API...");
      
      // Create proper FormData instance
      const formData = new FormData();
      formData.append('file', fs.createReadStream(localFilePath));
      
      // Use the correct endpoint - photos for an activity
      const stravaResponse = await axios.post(
        `https://www.strava.com/api/v3/activities/${activity.stravaId}/photos`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            ...formData.getHeaders()
          }
        }
      );
      
      console.log("Strava photo upload response:", stravaResponse.data);
      
      if (stravaResponse.data && stravaResponse.data.id) {
        stravaPhotoId = stravaResponse.data.id;
        // Use the URL from Strava if available
        if (stravaResponse.data.urls && stravaResponse.data.urls['600']) {
          photoUrl = stravaResponse.data.urls['600'];
        }
      }
    } catch (stravaError) {
      console.error("Error uploading to Strava:", stravaError.message);
      if (stravaError.response) {
        console.error("Response data:", stravaError.response.data);
      }
      // We continue with local storage
    }
  }

  // Save photo to database with the full URL
  const photo = await prisma.photo.create({
    data: {
      activityId,
      stravaId: stravaPhotoId ? BigInt(stravaPhotoId) : null,
      url: photoUrl,  // This is now a full URL that can be used directly by the frontend
      caption,
      isPrimary: false // New uploads are not primary by default
    }
  });

  console.log("Photo saved to database:", photo);

  // Clean up the uploaded temp file from multer
  fs.unlink(file.path, (err) => {
    if (err) console.error("Error deleting temp file:", err);
  });

  res.json(photo);
}

// Delete a photo
router.delete("/:photoId", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    const { photoId } = req.params;
    
    // Get user from DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get the photo
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: { activity: true }
    });

    if (!photo) {
      return res.status(404).json({ message: "Photo not found" });
    }

    // Verify ownership
    if (photo.activity.userId !== user.id) {
      return res.status(403).json({ message: "You don't have permission to delete this photo" });
    }

    // For real Strava activities, just log a warning - Strava API generally doesn't allow photo deletion
    if (!photo.activity.isMock && photo.stravaId) {
      console.log(`Warning: Cannot delete photo ${photo.stravaId} from Strava via API. Photos will remain on Strava but be removed from the local database.`);
    }

    // Delete photo from local storage if URL points to local file
    if (photo.url && photo.url.includes('localhost:3001/uploads/')) {
      try {
        const filename = photo.url.split('/').pop();
        const filePath = path.join(__dirname, '..', 'uploads', filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted local file: ${filePath}`);
        }
      } catch (fileErr) {
        console.error("Error deleting local file:", fileErr);
        // Continue with database deletion even if file deletion fails
      }
    }

    // Delete photo from database
    await prisma.photo.delete({
      where: { id: photoId }
    });

    res.json({ message: "Photo deleted successfully from application" });
  } catch (error) {
    console.error("Error deleting photo:", error);
    res.status(500).json({ 
      message: "Error deleting photo", 
      error: error.message 
    });
  }
});

// Set a photo as primary
router.put("/:photoId/primary", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    const { photoId } = req.params;
    
    // Get user from DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get the photo
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: { activity: true }
    });

    if (!photo) {
      return res.status(404).json({ message: "Photo not found" });
    }

    // Verify ownership
    if (photo.activity.userId !== user.id) {
      return res.status(403).json({ message: "You don't have permission to modify this photo" });
    }

    // Update photo on Strava if it's a real activity
    if (!photo.activity.isMock && photo.stravaId) {
      try {
        // Check if token is expired and refresh if needed
        const now = Math.floor(Date.now() / 1000);
        let accessToken = user.stravaToken;

        if (user.expiresAt && user.expiresAt < now) {
          const response = await axios.post("https://www.strava.com/oauth/token", {
            client_id: process.env.STRAVA_CLIENT_ID,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            refresh_token: user.refreshToken,
            grant_type: "refresh_token"
          });
          
          accessToken = response.data.access_token;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              stravaToken: response.data.access_token,
              refreshToken: response.data.refresh_token,
              expiresAt: response.data.expires_at
            }
          });
        }
        
        // Set as primary on Strava
        await axios.put(
          `https://www.strava.com/api/v3/activities/${photo.activity.stravaId}/photos/${photo.stravaId}`,
          { primary: true },
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
      } catch (stravaError) {
        console.error("Error updating primary photo on Strava:", stravaError);
        // Continue with local update even if Strava API fails
      }
    }

    // Reset all photos for this activity to non-primary
    await prisma.photo.updateMany({
      where: { 
        activityId: photo.activityId,
        isPrimary: true
      },
      data: { isPrimary: false }
    });

    // Set this photo as primary
    const updatedPhoto = await prisma.photo.update({
      where: { id: photoId },
      data: { isPrimary: true }
    });

    res.json(updatedPhoto);
  } catch (error) {
    console.error("Error setting primary photo:", error);
    res.status(500).json({ 
      message: "Error setting primary photo", 
      error: error.message 
    });
  }
});

// Debug route to check user's activities and photos
router.get("/debug-photos", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    
    // Get user from DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Get all activities for this user
    const activities = await prisma.activity.findMany({
      where: { userId: user.id },
      orderBy: { startDate: 'desc' }
    });
    
    console.log(`User has ${activities.length} activities`);
    
    // For each activity, find photos
    const activityPhotos = [];
    
    for (const activity of activities) {
      const photos = await prisma.photo.findMany({
        where: { activityId: activity.id }
      });
      
      activityPhotos.push({
        activity: {
          id: activity.id,
          name: activity.name,
          stravaId: activity.stravaId ? activity.stravaId.toString() : null
        },
        photoCount: photos.length,
        photos: photos.map(p => ({
          id: p.id,
          url: p.url,
          isPrimary: p.isPrimary
        }))
      });
    }
    
    res.json({
      totalActivities: activities.length,
      activitiesWithPhotos: activityPhotos.filter(a => a.photoCount > 0).length,
      activityPhotos
    });
    
  } catch (error) {
    console.error("Error debugging photos:", error);
    res.status(500).json({ message: "Error debugging photos", error: error.message });
  }
});

// Add this route to your photos.js routes file:
router.get("/debug", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    
    // Get user from DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Get all photos in the database
    const allPhotos = await prisma.photo.findMany({
      include: {
        activity: {
          select: {
            id: true,
            name: true,
            stravaId: true,
            isMock: true
          }
        }
      }
    });
    
    console.log(`Found ${allPhotos.length} total photos in database`);
    
    // Get all activities for this user
    const activities = await prisma.activity.findMany({
      where: { userId: user.id },
      orderBy: { startDate: 'desc' }
    });
    
    console.log(`User has ${activities.length} activities`);
    
    // For each activity, find photos
    const activityPhotos = [];
    
    for (const activity of activities) {
      const photos = await prisma.photo.findMany({
        where: { activityId: activity.id }
      });
      
      activityPhotos.push({
        activity: {
          id: activity.id,
          name: activity.name,
          stravaId: activity.stravaId ? activity.stravaId.toString() : null
        },
        photoCount: photos.length,
        photos: photos.map(p => ({
          id: p.id,
          url: p.url,
          isPrimary: p.isPrimary
        }))
      });
    }
    
    res.json({
      totalPhotosInDatabase: allPhotos.length,
      allPhotos: allPhotos.map(p => ({
        id: p.id,
        activityId: p.activityId,
        activityName: p.activity?.name || "Unknown",
        url: p.url,
        stravaId: p.stravaId ? p.stravaId.toString() : null,
        isPrimary: p.isPrimary
      })),
      totalActivities: activities.length,
      activitiesWithPhotos: activityPhotos.filter(a => a.photoCount > 0).length,
      activityPhotos
    });
    
  } catch (error) {
    console.error("Error debugging photos:", error);
    res.status(500).json({ message: "Error debugging photos", error: error.message });
  }
});

module.exports = router;