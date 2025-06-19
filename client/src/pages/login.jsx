import React from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, provider } from "../firebase";
import { useNavigate } from "react-router-dom";
import "../styles/login.css";

const Login = () => {
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const token = await result.user.getIdToken();

      const res = await fetch("http://localhost:3001/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      console.log("✅ Backend responded:", data);
      navigate("/dashboard");
    } catch (err) {
      console.error("❌ Login failed:", err);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <svg
            width="50"
            height="50"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12.0002 2.40002L7.2002 12.0001H10.8002L12.0002 9.6L13.2002 12.0001H16.8002L12.0002 2.40002Z"
              fill="#FC4C02"
            />
            <path
              d="M14.4 14.4001L13.2 12.0001L10.8 12.0001L9.6 14.4001L8.4 16.8001H11.9998H15.6L14.4 14.4001Z"
              fill="#FC4C02"
            />
          </svg>
        </div>
        <h1>StravaSync</h1>
        <p>
          Connect your Strava account to visualize and manage your activities
        </p>

        <button className="login-button" onClick={handleLogin}>
          <span className="login-button-icon">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 5C13.66 5 15 6.34 15 8C15 9.66 13.66 11 12 11C10.34 11 9 9.66 9 8C9 6.34 10.34 5 12 5ZM12 19.2C9.5 19.2 7.29 17.92 6 15.98C6.03 13.99 10 12.9 12 12.9C13.99 12.9 17.97 13.99 18 15.98C16.71 17.92 14.5 19.2 12 19.2Z"
                fill="white"
              />
            </svg>
          </span>
          Login with Google
        </button>

        <div className="login-footer">
          <p>© {new Date().getFullYear()} StravaSync</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
