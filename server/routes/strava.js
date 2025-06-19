const express = require("express");
const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const verifyToken = require("../middleware/auth");
const router = express.Router();
const prisma = new PrismaClient();

// Store temporary mapping between auth state and Firebase UID
const authStateToUser = new Map();

router.get("/connect", verifyToken, (req, res) => {
  try {
    const { uid } = req.user;
    // Generate a random state parameter for security
    const state = Math.random().toString(36).substring(2, 15);
    
    // Store the mapping between state and user
    authStateToUser.set(state, uid);
    
    console.log("STRAVA_CLIENT_ID:", process.env.STRAVA_CLIENT_ID);
    console.log("STRAVA_REDIRECT_URI:", process.env.STRAVA_REDIRECT_URI);
    console.log("State parameter:", state);
    console.log("User UID:", uid);
    
    const redirect = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${process.env.STRAVA_REDIRECT_URI}&state=${state}&approval_prompt=force&scope=read,read_all,profile:read_all,activity:read_all,activity:write`;
    
    console.log("Redirecting to:", redirect);
    res.redirect(redirect);
  } catch (error) {
    console.error("Error in /strava/connect:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  console.log("Callback received with code:", code, "state:", state);

  try {
    let firebaseUid;
    
    // Try to get Firebase UID from state parameter
    if (state && authStateToUser.has(state)) {
      firebaseUid = authStateToUser.get(state);
      authStateToUser.delete(state); // Clean up
      console.log("Found user by state:", firebaseUid);
    } 
    
    // If no valid state parameter, return error
    if (!firebaseUid) {
      console.error("No valid state parameter or user not found. State:", state);
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
            <h1>⚠️ Authentication Error</h1>
            <p>We couldn't verify your identity. Please try connecting again from the dashboard.</p>
            <script>
              setTimeout(() => {
                window.close();
                window.location.href = "http://localhost:5173/dashboard";
              }, 5000);
            </script>
          </body>
        </html>
      `);
    }

    // Find user by Firebase UID
    const user = await prisma.user.findUnique({
      where: { firebaseUid },
    });

    if (!user) {
      console.error("User not found with Firebase UID:", firebaseUid);
      return res.status(404).send("User not found. Please log in again.");
    }

    console.log("Exchanging token with Strava...");
    const response = await axios.post("https://www.strava.com/oauth/token", {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    });

    const { access_token, refresh_token, expires_at } = response.data;
    console.log("Received tokens from Strava");

    // Update user record
    await prisma.user.update({
      where: { id: user.id },
      data: {
        stravaToken: access_token,
        refreshToken: refresh_token,
        expiresAt: expires_at,
      },
    });
    console.log("Updated user with Strava tokens");

    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
          <h1>✅ Strava Connected Successfully!</h1>
          <p>Your Strava account has been connected to the application.</p>
          <p>You can close this window and return to the app.</p>
          <script>
            window.onload = function() {
              // Try to find the opener window and communicate success
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ type: 'STRAVA_CONNECTED', success: true }, '*');
              }
              
              // Attempt to close this window
              setTimeout(() => {
                window.close();
                // Fallback if window.close() doesn't work - redirect to the correct port
                window.location.href = "http://localhost:3000/dashboard";
              }, 3000);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Strava token exchange failed:", err);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
          <h1>❌ Error connecting to Strava</h1>
          <p>Details: ${err.message || "Unknown error"}</p>
          <p>Please try again.</p>
        </body>
      </html>
    `);
  }
});

// Disconnect Strava and clear tokens
router.post("/disconnect", verifyToken, async (req, res) => {
  try {
    const { uid } = req.user;
    
    // Get user from DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update user to remove Strava tokens
    await prisma.user.update({
      where: { id: user.id },
      data: {
        stravaToken: null,
        refreshToken: null,
        expiresAt: null,
      },
    });

    res.json({ message: "Successfully disconnected Strava" });
  } catch (error) {
    console.error("Error disconnecting Strava:", error);
    res.status(500).json({ 
      message: "Error disconnecting Strava", 
      error: error.message 
    });
  }
});

module.exports = router;
