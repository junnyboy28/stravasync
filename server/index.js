const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const verifyToken = require("./middleware/auth");
const path = require("path");
const fs = require("fs");

// Load env variables first
require("dotenv").config();

const app = express();
// Set up middleware
app.use(cors());
app.use(express.json());

const prisma = new PrismaClient();
const stravaRoutes = require("./routes/strava");
const activitiesRoutes = require("./routes/activities");
const photosRoutes = require("./routes/photos");

// Mount routes after middleware
app.use("/strava", stravaRoutes);
app.use("/activities", activitiesRoutes);
app.use("/photos", photosRoutes);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve static files with proper CORS settings
app.use(
  "/uploads",
  (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Cache-Control", "no-cache");
    next();
  },
  express.static(path.join(__dirname, "uploads"))
);

app.get("/me", verifyToken, async (req, res) => {
  const { uid, email } = req.user;

  // Check if user exists in DB
  let user = await prisma.user.findUnique({
    where: { firebaseUid: uid },
  });

  // If not, create one
  if (!user) {
    user = await prisma.user.create({
      data: {
        firebaseUid: uid,
        email,
      },
    });
  }

  res.json({ message: "Authenticated", user });
});

app.listen(3001, () => {
  console.log("🚀 Server running on http://localhost:3001");
});
