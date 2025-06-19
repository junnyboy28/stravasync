const express = require("express");
const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const verifyToken = require("../middleware/auth");
const router = express.Router();
const prisma = new PrismaClient();

// Helper function to map numeric exertion to text
function mapExertionToText(value) {
  if (!value) return null;
  const num = parseInt(value);
  if (num <= 2) return "Easy";
  if (num <= 4) return "Moderate";
  return "Max Effort";
}

// Fetch activities from Strava and store in DB
router.get("/sync", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    
    // Get user from DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.stravaToken) {
      return res.status(400).json({ message: "User not connected to Strava" });
    }

    // Check if token is expired and refresh if needed
    const now = Math.floor(Date.now() / 1000);
    let accessToken = user.stravaToken;

    if (user.expiresAt && user.expiresAt < now) {
      // Token is expired, refresh it
      console.log("Refreshing Strava token...");
      const response = await axios.post("https://www.strava.com/oauth/token", {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        refresh_token: user.refreshToken,
        grant_type: "refresh_token"
      });

      // Update tokens in DB
      accessToken = response.data.access_token;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          stravaToken: response.data.access_token,
          refreshToken: response.data.refresh_token,
          expiresAt: response.data.expires_at
        }
      });
      console.log("Token refreshed successfully");
    }

    // Fetch activity list from Strava API (summary data)
    const activitiesResponse = await axios.get(
      "https://www.strava.com/api/v3/athlete/activities", 
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { per_page: 30 } // Limit to 30 most recent activities
      }
    );

    const stravaActivities = activitiesResponse.data;
    console.log(`Fetched ${stravaActivities.length} activities from Strava`);

    // For each activity, fetch detailed data
    for (const summaryActivity of stravaActivities) {
      try {
        // Get detailed activity data
        console.log(`Fetching details for activity ${summaryActivity.id}`);
        const detailResponse = await axios.get(
          `https://www.strava.com/api/v3/activities/${summaryActivity.id}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        
        const activity = detailResponse.data;
        console.log(`Got detailed data for: ${activity.name}`);
        
        // Debug log to see all available fields
        console.log("Activity fields:", Object.keys(activity));
        
        // Process photos if available
        let photosToCreate = [];
        if (activity.photos && activity.photos.primary) {
          const photos = activity.photos;
          
          // Primary photo - add safe checks to prevent undefined BigInt conversion
          if (photos.primary && photos.primary.id && photos.primary.urls) {
            try {
              const primaryPhoto = {
                url: photos.primary.urls['600'] || photos.primary.urls[0] || "",
                caption: photos.primary.caption || null,
                isPrimary: true,
                stravaId: photos.primary.id ? BigInt(photos.primary.id) : null
              };
              photosToCreate.push(primaryPhoto);
            } catch (photoError) {
              console.error(`Error processing primary photo: ${photoError.message}`);
            }
          }
          
          // Process additional photos with proper error handling
          if (photos.count > 0 && Array.isArray(photos.additional)) {
            photos.additional.forEach(photo => {
              try {
                if (photo && photo.id && photo.urls) {
                  photosToCreate.push({
                    url: photo.urls['600'] || photo.urls[0] || "",
                    caption: photo.caption || null,
                    isPrimary: false,
                    stravaId: photo.id ? BigInt(photo.id) : null
                  });
                }
              } catch (photoError) {
                console.error(`Error processing additional photo: ${photoError.message}`);
              }
            });
          }
        }

        // Create or update activity in database with ALL fields
        const upsertedActivity = await prisma.activity.upsert({
          where: { stravaId: BigInt(activity.id) },
          update: {
            name: activity.name,
            type: activity.type,
            distance: activity.distance,
            movingTime: activity.moving_time,
            startDate: new Date(activity.start_date),
            updatedAt: new Date(),
            // Convert numeric perceived_exertion to text representation
            perceivedExertion: activity.perceived_exertion 
              ? mapExertionToText(activity.perceived_exertion) 
              : null,
            // Convert numeric values to strings for JSON serialization
            description: activity.description || null,
            privateNotes: activity.private_note || null,
            isCommute: activity.commute || false,
            isIndoor: activity.trainer || false,
            calories: activity.calories || 0,
            isMock: false, // Ensure real Strava activities are never flagged as mock
            // First delete existing photos for this activity
            photos: {
              deleteMany: {},
              // Then create new ones
              create: photosToCreate
            }
          },
          create: {
            userId: user.id,
            stravaId: BigInt(activity.id),
            name: activity.name,
            type: activity.type,
            distance: activity.distance,
            movingTime: activity.moving_time,
            startDate: new Date(activity.start_date),
            // Convert numeric perceived_exertion to text representation
            perceivedExertion: activity.perceived_exertion 
              ? mapExertionToText(activity.perceived_exertion) 
              : null,
            // Convert numeric values to strings for JSON serialization
            description: activity.description || null,
            privateNotes: activity.private_note || null,
            isCommute: activity.commute || false,
            isIndoor: activity.trainer || false,
            calories: activity.calories || 0,
            isMock: false,
            photos: {
              create: photosToCreate
            }
          },
          include: {
            photos: true // Include photos in the response
          }
        });
        console.log(`✅ Successfully upserted activity: ${activity.name}`);
      } catch (detailError) {
        console.error(`❌ Error fetching details for activity ${summaryActivity.id}:`, detailError.message);
      }
    }

    // Return success message
    res.json({ 
      message: "Activities synced successfully", 
      count: stravaActivities.length 
    });

  } catch (error) {
    console.error("Error syncing activities:", error);
    res.status(500).json({ 
      message: "Error syncing activities", 
      error: error.message 
    });
  }
});

// Get activities from database
router.get("/", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    
    // Get user from DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get activities from DB
    const activities = await prisma.activity.findMany({
      where: { userId: user.id },
      orderBy: { startDate: 'desc' }
    });

    // Convert BigInt to String to make it JSON-serializable
    const serializedActivities = activities.map(activity => ({
      ...activity,
      stravaId: activity.stravaId.toString() // Convert BigInt to String
    }));

    res.json(serializedActivities);

  } catch (error) {
    console.error("Error fetching activities:", error);
    res.status(500).json({ 
      message: "Error fetching activities", 
      error: error.message 
    });
  }
});

// Update an activity
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    const { id } = req.params;
    const { 
      name, 
      description, 
      perceivedExertion, 
      privateNotes, 
      isCommute, 
      isIndoor 
    } = req.body;
    
    // Get user from DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get activity from DB
    const activity = await prisma.activity.findUnique({
      where: { id }
    });

    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }

    if (activity.userId !== user.id) {
      return res.status(403).json({ message: "You don't have permission to update this activity" });
    }

    // Use the explicit isMock flag rather than ID range
    const isMockActivity = activity.isMock === true;
    
    // Only try to update real Strava activities
    if (!isMockActivity && user.stravaToken) {
      try {
        // Check if token is expired and refresh if needed
        const now = Math.floor(Date.now() / 1000);
        let accessToken = user.stravaToken;

        if (user.expiresAt && user.expiresAt < now) {
          // Token is expired, refresh it
          const response = await axios.post("https://www.strava.com/oauth/token", {
            client_id: process.env.STRAVA_CLIENT_ID,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            refresh_token: user.refreshToken,
            grant_type: "refresh_token"
          });

          // Update tokens in DB
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

        // Update activity on Strava
        try {
          // Convert text exertion to numeric value that Strava expects
          let perceivedExertionNum = null;
          if (perceivedExertion === "Easy") perceivedExertionNum = 1;
          if (perceivedExertion === "Moderate") perceivedExertionNum = 3; 
          if (perceivedExertion === "Max Effort") perceivedExertionNum = 5;
          
          console.log(`Updating activity ${activity.stravaId} on Strava with token: ${accessToken.substring(0, 15)}...`);
          
          // Create a clean payload object with only valid fields
          const stravaPayload = {
            name: name,
            type: activity.type, // Keep the original activity type
            description: description || "",
            commute: isCommute === true,
            trainer: isIndoor === true,
            private_note: privateNotes || ""
          };
          
          // Only add perceived_exertion if we have a value
          if (perceivedExertionNum !== null) {
            stravaPayload.perceived_exertion = perceivedExertionNum;
          }
          
          console.log("Strava update payload:", JSON.stringify(stravaPayload));
          
          const stravaResponse = await axios({
            method: 'put',
            url: `https://www.strava.com/api/v3/activities/${activity.stravaId}`,
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            data: stravaPayload
          });
          
          console.log(`✅ Strava update successful (Status: ${stravaResponse.status})`);
          console.log("Strava response:", JSON.stringify(stravaResponse.data, null, 2).substring(0, 500));
        } catch (stravaError) {
          console.error("❌ Error updating Strava activity:", stravaError.message);
          
          // Enhanced error logging
          if (stravaError.response) {
            console.error("Strava API error details:", {
              status: stravaError.response.status,
              statusText: stravaError.response.statusText,
              data: JSON.stringify(stravaError.response.data)
            });
          } else if (stravaError.request) {
            console.error("No response received from Strava API");
          }
          
          // Fail the whole request if Strava update fails for non-mock activities
          if (!isMockActivity) {
            return res.status(500).json({ 
              message: "Failed to update activity on Strava", 
              error: stravaError.response?.data || stravaError.message 
            });
          }
        }
      } catch (error) {
        console.error("Error refreshing Strava token:", error.message);
        return res.status(500).json({ 
          message: "Error updating activity", 
          error: error.message 
        });
      }
    } else if (isMockActivity) {
      console.log("Skipping Strava API update for mock activity:", activity.stravaId);
    }

    // Always update the activity in our local DB
    const updatedActivity = await prisma.activity.update({
      where: { id },
      data: { 
        name, 
        description, 
        perceivedExertion, 
        privateNotes, 
        isCommute, 
        isIndoor,
        updatedAt: new Date() 
      }
    });

    // Convert BigInt to String for JSON serialization
    const serializedActivity = {
      ...updatedActivity,
      stravaId: updatedActivity.stravaId.toString()
    };

    res.json(serializedActivity);

  } catch (error) {
    console.error("Error updating activity:", error);
    res.status(500).json({ 
      message: "Error updating activity", 
      error: error.message 
    });
  }
});

// Generate mock activities for testing
router.post("/mock", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    const { count = 10 } = req.body; // Default to 10 mock activities
    
    // Get user from DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Activity types from Strava
    const activityTypes = ["Run", "Ride", "Swim", "Walk", "Hike", "WeightTraining", "Yoga"];
    
    // Generate random activities
    const mockActivities = [];
    const today = new Date();
    
    for (let i = 0; i < count; i++) {
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - Math.floor(Math.random() * 60)); // Random date in last 60 days
      
      const type = activityTypes[Math.floor(Math.random() * activityTypes.length)];
      const distance = Math.random() * 10000; // Random distance up to 10km
      const movingTime = Math.floor(Math.random() * 7200); // Random duration up to 2 hours
      
      const mockActivity = await prisma.activity.create({
        data: {
          userId: user.id,
          stravaId: BigInt(2000000000 + i),
          name: `Test ${type} ${i+1}`,
          type,
          distance,
          movingTime,
          startDate,
          description: `Test description for ${type} activity`,
          perceivedExertion: ["Easy", "Moderate", "Max Effort"][Math.floor(Math.random() * 3)],
          privateNotes: Math.random() > 0.5 ? "Some private notes" : null,
          isCommute: Math.random() > 0.7,
          isIndoor: Math.random() > 0.7,
          calories: Math.floor(Math.random() * 1000),
          updatedAt: new Date(),
          isMock: true, // Explicitly mark as mock
        }
      });
      
      mockActivities.push(mockActivity);
    }

    // Convert BigInt values to strings before sending the response
    const serializedMockActivities = mockActivities.map(activity => ({
      ...activity,
      stravaId: activity.stravaId.toString() // Convert BigInt to String
    }));

    res.json({ 
      message: `Created ${serializedMockActivities.length} mock activities`, 
      activities: serializedMockActivities 
    });
  } catch (error) {
    console.error("Error creating mock activities:", error);
    res.status(500).json({ 
      message: "Error creating mock activities", 
      error: error.message 
    });
  }
});

// Delete all mock activities
router.delete("/mock", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    
    // Get user from DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Delete all activities with stravaId >= 2000000000
    const result = await prisma.activity.deleteMany({
      where: { 
        userId: user.id,
        isMock: true // Use the explicit flag instead of ID range
      }
    });

    res.json({ 
      message: `Successfully deleted ${result.count} mock activities`, 
      count: result.count 
    });

  } catch (error) {
    console.error("Error deleting mock activities:", error);
    res.status(500).json({ 
      message: "Error deleting mock activities", 
      error: error.message 
    });
  }
});

// Delete ALL activities for a user
router.delete("/all", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    
    // Get user from DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Delete ALL activities for this user
    const result = await prisma.activity.deleteMany({
      where: { 
        userId: user.id
      }
    });

    res.json({ 
      message: `Successfully deleted ${result.count} activities`, 
      count: result.count 
    });

  } catch (error) {
    console.error("Error deleting activities:", error);
    res.status(500).json({ 
      message: "Error deleting activities", 
      error: error.message 
    });
  }
});

// Debug endpoint to test Strava API
router.post("/test-strava-api", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    const { activityId } = req.body;
    
    // Get user from DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user || !user.stravaToken) {
      return res.status(400).json({ message: "User not connected to Strava" });
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

    // Make a test request to the Strava API
    const stravaResponse = await axios.get(
      `https://www.strava.com/api/v3/activities/${activityId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    res.json({ 
      message: "Test successful",
      data: {
        status: stravaResponse.status,
        activity: stravaResponse.data
      }
    });
  } catch (error) {
    console.error("Test Strava API Error:", error);
    
    // Send detailed error info
    const errorDetails = {
      message: error.message,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : null,
      request: error.request ? "Request was made but no response received" : null
    };
    
    res.status(500).json({ error: "Test failed", details: errorDetails });
  }
});

// Test Strava authentication
router.get("/test-auth", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    
    // Get user from DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user || !user.stravaToken) {
      return res.status(400).json({ message: "User not connected to Strava" });
    }

    // Check if token is expired and refresh if needed
    const now = Math.floor(Date.now() / 1000);
    let accessToken = user.stravaToken;

    if (user.expiresAt && user.expiresAt < now) {
      console.log("Token expired, refreshing...");
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
      console.log("Token refreshed successfully");
    }

    // Test the token with a simple API call
    const athleteResponse = await axios.get("https://www.strava.com/api/v3/athlete", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    res.json({
      message: "Strava authentication test successful",
      athlete: athleteResponse.data,
      token: {
        valid: true,
        expiresAt: user.expiresAt,
        expiresIn: user.expiresAt - now
      }
    });
  } catch (error) {
    console.error("Authentication test failed:", error.message);
    
    res.status(500).json({
      message: "Strava authentication test failed",
      error: error.message,
      response: error.response?.data
    });
  }
});

// Fix incorrectly flagged activities
router.post("/fix-mock-flags", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    
    // Get user from DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update all activities to use proper flags instead of ID-based logic
    const result = await prisma.activity.updateMany({
      where: { userId: user.id },
      data: { 
        isMock: {
          set: false  // Set all activities to non-mock for now
        }
      }
    });

    res.json({ 
      message: `Fixed mock flags for ${result.count} activities`, 
      count: result.count 
    });

  } catch (error) {
    console.error("Error fixing mock flags:", error);
    res.status(500).json({ 
      message: "Error fixing mock flags", 
      error: error.message 
    });
  }
});

// Sync photos for existing activities
router.get("/sync-photos", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    
    // Get user from DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user || !user.stravaToken) {
      return res.status(400).json({ message: "User not connected to Strava" });
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

    // Get non-mock activities from DB
    const activities = await prisma.activity.findMany({
      where: { 
        userId: user.id,
        isMock: false 
      }
    });

    let updatedCount = 0;

    // For each activity, fetch photos from Strava
    for (const activity of activities) {
      try {
        if (!activity.stravaId) continue;
        
        console.log(`Fetching photos for activity ${activity.stravaId}`);
        
        // Get activity photos with a longer timeout
        const photosResponse = await axios.get(
          `https://www.strava.com/api/v3/activities/${activity.stravaId}/photos?size=600`,
          { 
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 10000 // 10 second timeout
          }
        );
        
        console.log(`Photos response status: ${photosResponse.status}`);
        console.log(`Photos response data:`, JSON.stringify(photosResponse.data).substring(0, 200));
        
        const photos = photosResponse.data;
        if (!photos || photos.length === 0) {
          console.log(`No photos found for activity ${activity.stravaId}`);
          continue;
        }
        
        console.log(`Found ${photos.length} photos for activity ${activity.stravaId}`);
        
        // Delete existing photos for this activity
        await prisma.photo.deleteMany({
          where: { activityId: activity.id }
        });
        
        // Add new photos
        for (const photo of photos) {
          try {
            console.log("Processing Strava photo:", JSON.stringify(photo));
            
            let photoId;
            // Handle either id or unique_id from Strava's API
            if (photo.id) {
              photoId = photo.id;
            } else if (photo.unique_id) {
              // Use unique_id or a hash of it for the stravaId field
              photoId = parseInt(photo.activity_id.toString() + photo.unique_id.replace(/\D/g, '').substring(0, 8));
            } else {
              console.error("Photo has neither id nor unique_id:", photo);
              continue;
            }
            
            // Handle URL construction
            let photoUrl;
            if (photo.urls && Object.keys(photo.urls).length > 0) {
              photoUrl = photo.urls['600'] || photo.urls[Object.keys(photo.urls)[0]];
            } else {
              // Construct URL based on Strava's format
              photoUrl = `https://dgalywyr863hv.cloudfront.net/pictures/activities/${activity.stravaId}/photos/${photo.unique_id}/large.jpg`;
            }
            
            console.log(`Creating photo with URL: ${photoUrl}`);
            
            // Create the photo with explicit error handling
            try {
              const createdPhoto = await prisma.photo.create({
                data: {
                  activityId: activity.id,
                  url: photoUrl,
                  caption: photo.caption || null,
                  isPrimary: photo.primary === true,
                  // Use the processed ID or fallback to a number
                  stravaId: BigInt(photoId || Date.now())
                }
              });
              
              console.log(`Successfully created photo with ID: ${createdPhoto.id}`);
            } catch (dbError) {
              console.error(`Database error creating photo:`, dbError);
              // Try a simpler version without stravaId if that's causing problems
              try {
                const createdPhoto = await prisma.photo.create({
                  data: {
                    activityId: activity.id,
                    url: photoUrl,
                    caption: photo.caption || null,
                    isPrimary: photo.primary === true
                  }
                });
                console.log(`Successfully created photo with ID (fallback): ${createdPhoto.id}`);
              } catch (fallbackError) {
                console.error(`Even fallback photo creation failed:`, fallbackError);
              }
            }
          } catch (photoError) {
            console.error(`Error processing photo:`, photoError);
          }
        }
        
        updatedCount++;
      } catch (error) {
        console.error(`Error fetching photos for activity ${activity.stravaId}:`, error.message);
      }
    }

    res.json({ 
      message: "Photos synced successfully", 
      count: updatedCount 
    });
    
  } catch (error) {
    console.error("Error syncing photos:", error);
    res.status(500).json({ 
      message: "Error syncing photos", 
      error: error.message 
    });
  }
});

module.exports = router;