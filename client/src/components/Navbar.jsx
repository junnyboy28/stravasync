import React, { useState } from 'react';
import '../styles/navbar.css';

const Navbar = ({ 
  onLogout, 
  onSyncActivities, 
  onSyncPhotos, 
  onTestAuth, 
  onDisconnectStrava,
  isSyncing,
  userName 
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  
  const toggleMenu = () => setMenuOpen(!menuOpen);
  
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <h1>StravaSync</h1>
      </div>
      
      <div className="navbar-user">
        <span>{userName}</span>
      </div>
      
      <div className="navbar-menu-container">
        <button className="menu-toggle" onClick={toggleMenu}>
          <span className="hamburger"></span>
        </button>
        
        <div className={`navbar-menu ${menuOpen ? 'open' : ''}`}>
          <button className="menu-item" onClick={onSyncActivities} disabled={isSyncing}>
            {isSyncing ? "Syncing..." : "Sync Activities"}
          </button>
          <button className="menu-item" onClick={onSyncPhotos} disabled={isSyncing}>
            {isSyncing ? "Syncing..." : "Sync Photos"}
          </button>
          <button className="menu-item" onClick={onTestAuth}>
            Test Connection
          </button>
          <button className="menu-item danger" onClick={onDisconnectStrava}>
            Disconnect Strava
          </button>
          <button className="menu-item danger" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;