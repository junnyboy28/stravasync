const admin = require("../firebase");

const verifyToken = async (req, res, next) => {
  let idToken = null;

  // 1. Check Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    idToken = req.headers.authorization.split("Bearer ")[1];
  }

  // 2. Fallback: Check query param (?token=...)
  else if (req.query.token) {
    idToken = req.query.token;
  }

  // 3. No token found
  if (!idToken) {
    return res.status(401).json({ message: "Unauthorized: Token missing" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("❌ Firebase token verification failed:", err);
    return res.status(401).json({ message: "Invalid Firebase token" });
  }
};

module.exports = verifyToken;
