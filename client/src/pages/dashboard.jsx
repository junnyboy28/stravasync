import React, { useState, useEffect, useCallback } from "react";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import Calendar from "../components/Calendar";
import PhotoGallery from "../components/PhotoGallery";
import Navbar from "../components/Navbar";
import "../styles/dashboard.css";
import "../styles/calendar.css";

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnectingStrava, setIsConnectingStrava] = useState(false);
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [editActivity, setEditActivity] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [activityPhotos, setActivityPhotos] = useState([]);
  const navigate = useNavigate();

  // Define fetchActivities first, before any other functions that use it
  const fetchActivities = useCallback(async (token) => {
    try {
      setActivitiesLoading(true);
      const response = await fetch("http://localhost:3001/activities", {
        headers: {
          Authorization: `Bearer ${token || await auth.currentUser.getIdToken()}`,
        },
      });
      const data = await response.json();
      setActivities(data);
    } catch (error) {
      console.error("Error fetching activities:", error);
      showError("Failed to load activities");
    } finally {
      setActivitiesLoading(false);
    }
  }, []);

  // Update the onPhotoAdded handler
  const handlePhotoAdded = (newPhoto) => {
    console.log("New photo added:", newPhoto);
    // Immediately add the new photo to the list
    setActivityPhotos(prevPhotos => [...prevPhotos, newPhoto]);
  };

  const handlePhotoDeleted = (photoId) => {
    setActivityPhotos(activityPhotos.filter(p => p.id !== photoId));
  };

  const handlePrimaryChanged = (updatedPhoto) => {
    setActivityPhotos(activityPhotos.map(p => 
      p.id === updatedPhoto.id ? 
        { ...p, isPrimary: true } : 
        { ...p, isPrimary: false }
    ));
  };

  const showError = (message, duration = 5000) => {
    setErrorMessage(message);
    setTimeout(() => {
      setErrorMessage(null);
    }, duration);
  };

  const showSuccess = (message, duration = 5000) => {
    setSuccessMessage(message);
    setTimeout(() => {
      setSuccessMessage(null);
    }, duration);
  };

  const fetchUserData = useCallback(async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      
      const token = await currentUser.getIdToken();
      const response = await fetch("http://localhost:3001/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        }
      });
      const data = await response.json();
      setUserData(data.user);
      
      // If user is connected to Strava, fetch activities
      if (data.user.stravaToken) {
        fetchActivities(token);
      }
    } catch (error) {
      console.error("Error refreshing user data:", error);
    }
  }, [fetchActivities]); 

  // Now useEffect can safely depend on fetchActivities
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Fetch user data from backend
        try {
          const token = await currentUser.getIdToken();
          const response = await fetch("http://localhost:3001/me", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const data = await response.json();
          console.log("User data:", data);
          setUserData(data.user);
          
          // If user is connected to Strava, fetch activities
          if (data.user.stravaToken) {
            fetchActivities(token);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      } else {
        navigate("/");
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [navigate, fetchActivities]); 
  
  const syncActivities = async () => {
    try {
      setIsSyncing(true);
      const token = await auth.currentUser.getIdToken();
      
      const response = await fetch("http://localhost:3001/activities/sync", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Sync response:", data);
      showSuccess(`Successfully synced ${data.count} activities from Strava`);
      
      // Refresh activities
      fetchActivities(token);
      
      setIsSyncing(false);
    } catch (error) {
      console.error("Error syncing activities:", error);
      setIsSyncing(false);
      showError(`Failed to sync activities: ${error.message}`);
    }
  };

  const syncPhotos = async () => {
    try {
      setIsSyncing(true); // Reuse the same loading state
      const token = await auth.currentUser.getIdToken();
      
      const response = await fetch("http://localhost:3001/activities/sync-photos", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Photo sync response:", data);
      showSuccess(`Successfully synced photos for ${data.count} activities`);
      
      // Refresh activities to show updated photos
      fetchActivities(token);
      
      setIsSyncing(false);
    } catch (error) {
      console.error("Error syncing photos:", error);
      setIsSyncing(false);
      showError(`Failed to sync photos: ${error.message}`);
    }
  };

  const handleActivityClick = async (activity) => {
    setSelectedActivity(activity);
    
    // Fetch photos for this activity
    try {
      const token = await auth.currentUser.getIdToken();
      
      const response = await fetch(`http://localhost:3001/photos/activity/${activity.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const photos = await response.json();
        console.log("Fetched photos for activity:", photos);
        setActivityPhotos(photos);
      } else {
        console.error(`Error fetching photos: ${response.status}`);
        setActivityPhotos([]);
      }
    } catch (error) {
      console.error("Error fetching activity photos:", error);
      setActivityPhotos([]);
    }
  };

  const handleEditActivity = () => {
    setEditActivity({...selectedActivity});
    setSelectedActivity(null);
  };

  const handleSaveActivity = async () => {
    try {
      const token = await auth.currentUser.getIdToken();
      
      const response = await fetch(`http://localhost:3001/activities/${editActivity.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editActivity.name,
          description: editActivity.description || null,
          perceivedExertion: editActivity.perceivedExertion || null,
          privateNotes: editActivity.privateNotes || null,
          isCommute: editActivity.isCommute || false,
          isIndoor: editActivity.isIndoor || false,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Update response:", data);
      
      // Update activity in local state
      setActivities(activities.map(a => 
        a.id === editActivity.id ? {...a, 
          name: editActivity.name,
          description: editActivity.description,
          perceivedExertion: editActivity.perceivedExertion,
          privateNotes: editActivity.privateNotes,
          isCommute: editActivity.isCommute,
          isIndoor: editActivity.isIndoor,
        } : a
      ));
      
      // Show appropriate message based on whether it's a mock activity
      if (parseInt(editActivity.stravaId) >= 2000000000) {
        showSuccess("Mock activity updated successfully (local only)");
      } else {
        showSuccess("Activity updated successfully on Strava and locally");
      }
      
      setEditActivity(null);
    } catch (error) {
      console.error("Error updating activity:", error);
      showError(`Failed to update activity: ${error.message}`);
    }
  };

  const changeMonth = (increment) => {
    let newMonth = currentMonth + increment;
    let newYear = currentYear;
    
    if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    } else if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    }
    
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  const connectStrava = async () => {
    try {
      setIsConnectingStrava(true);
      const user = auth.currentUser;
      if (!user) {
        console.error("No user logged in");
        return;
      }

      const token = await user.getIdToken();
      
      // Direct redirection approach instead of popup
      window.location.href = `http://localhost:3001/strava/connect?token=${token}`;
    } catch (error) {
      console.error("Error connecting to Strava:", error);
      setIsConnectingStrava(false);
    }
  };

  const handleLogout = () => {
    auth.signOut();
    navigate("/");
  };

  const generateMockData = async () => {
    try {
      const token = await auth.currentUser.getIdToken();
      
      const response = await fetch("http://localhost:3001/activities/mock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ count: 20 }), // Generate 20 mock activities
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      showSuccess(`Created ${data.activities.length} mock activities`);
      
      // Refresh activities
      fetchActivities(token);
    } catch (error) {
      console.error("Error generating mock data:", error);
      showError(`Failed to generate mock data: ${error.message}`);
    }
  };

  const deleteMockData = async () => {
    try {
      const token = await auth.currentUser.getIdToken();
      
      const response = await fetch("http://localhost:3001/activities/mock", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      showSuccess(`Deleted ${data.count} mock activities`);
      
      // Refresh activities
      fetchActivities(token);
    } catch (error) {
      console.error("Error deleting mock data:", error);
      showError(`Failed to delete mock data: ${error.message}`);
    }
  };

  // Add this function to the Dashboard component
  const deleteAllActivities = async () => {
    if (!window.confirm("Are you sure you want to delete ALL activities? This cannot be undone.")) {
      return;
    }
    
    try {
      const token = await auth.currentUser.getIdToken();
      
      const response = await fetch("http://localhost:3001/activities/all", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      showSuccess(`Deleted ${data.count} activities`);
      
      // Refresh activities (should show empty now)
      setActivities([]);
    } catch (error) {
      console.error("Error deleting activities:", error);
      showError(`Failed to delete activities: ${error.message}`);
    }
  };

  // Add this function to Dashboard component:

  const reconnectStrava = async () => {
    if (!window.confirm("This will disconnect your current Strava connection and require you to authorize again with full permissions. Continue?")) {
      return;
    }
    
    try {
      // First disconnect
      const token = await auth.currentUser.getIdToken();
      await fetch("http://localhost:3001/strava/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Then reconnect
      connectStrava();
      
      showSuccess("Please reconnect your Strava account with the required permissions");
    } catch (error) {
      console.error("Error reconnecting to Strava:", error);
      showError("Failed to reconnect to Strava");
    }
  };

  // Add this function after your existing functions but before the return statement
  const testStravaAuth = async () => {
    try {
      // Show we're testing
      showSuccess("Testing Strava authorization...");
      
      // Get fresh token
      const token = await auth.currentUser.getIdToken();
      
      const response = await fetch("http://localhost:3001/activities/test-auth", {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      // Process response
      const data = await response.json();
      
      if (data.athlete && data.athlete.id) {
        // Success! Show the user details
        showSuccess(`Connected as: ${data.athlete.firstname} ${data.athlete.lastname}`);
        console.log("Strava Auth Test Result:", data);
        
        // Check if we have proper scopes
        if (data.token && data.token.scopes) {
          alert(`Strava permissions: ${data.token.scopes.join(', ')}`);
        }
        
        return true;
      } else {
        showError("Connected to Strava but couldn't fetch athlete data");
        console.error("Test failed:", data);
        return false;
      }
    } catch (error) {
      showError(`Strava auth test failed: ${error.message}`);
      console.error("Auth test error:", error);
      return false;
    }
  };

  // Add this function to the Dashboard component near your other Strava-related functions
  const disconnectStrava = async () => {
    if (!window.confirm("Are you sure you want to disconnect your Strava account?")) {
      return;
    }
    
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("http://localhost:3001/strava/disconnect", {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${token}` 
        }
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      // Refresh user data
      await fetchUserData();
      showSuccess("Successfully disconnected from Strava");
    } catch (error) {
      console.error("Error disconnecting from Strava:", error);
      showError(`Failed to disconnect: ${error.message}`);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <Navbar
        userName={user?.displayName || user?.email || "User"}
        onLogout={handleLogout}
        onSyncActivities={syncActivities}
        onSyncPhotos={syncPhotos}
        onTestAuth={testStravaAuth}
        onDisconnectStrava={disconnectStrava}
        isSyncing={isSyncing}
      />
      
      <div className="dashboard-container">
        {errorMessage && (
          <div className="notification error">{errorMessage}</div>
        )}
        
        {successMessage && (
          <div className="notification success">{successMessage}</div>
        )}
        
        {userData?.stravaToken ? (
          <div className="connected-view">
            <div className="connection-banner">
              <div className="connection-banner-icon">✓</div>
              <div className="connection-banner-text">
                <h3>Connected to Strava</h3>
                <p>Your Strava account is linked and activities are being synced.</p>
              </div>
            </div>
            
            <div className="calendar-container">
              <div className="month-selector">
                <h2>{new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' })} {currentYear}</h2>
                <div className="month-selector-controls">
                  <button onClick={() => changeMonth(-1)}>Previous</button>
                  <button onClick={() => changeMonth(1)}>Next</button>
                </div>
              </div>
              
              {activitiesLoading ? (
                <div className="loading-indicator">Loading activities...</div>
              ) : activities.length > 0 ? (
                <Calendar 
                  activities={activities} 
                  month={currentMonth}
                  year={currentYear}
                  onActivityClick={handleActivityClick}
                />
              ) : (
                <div className="empty-state">
                  <p>No activities found for this month. Use the menu to sync your Strava activities.</p>
                </div>
              )}
            </div>
            
            {/* Keep your existing modals but style them better */}
            {selectedActivity && (
              <div className="activity-modal modal-overlay">
                <div className="activity-modal-content modal-content">
                  <h3>
                    {selectedActivity.isMock && 
                      <span style={{ 
                        fontSize: '12px', 
                        backgroundColor: '#f8f9fa', 
                        color: '#333', 
                        padding: '2px 6px', 
                        borderRadius: '3px', 
                        marginRight: '8px',
                        verticalAlign: 'middle' 
                      }}>
                        Test Data
                      </span>
                    }
                    {selectedActivity.name}
                  </h3>
                  <div className="activity-details">
                    <div className="detail-row">
                      <span className="label">Type:</span>
                      <span className="value">{selectedActivity.type}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Distance:</span>
                      <span className="value">{(selectedActivity.distance / 1000).toFixed(2)} km</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Duration:</span>
                      <span className="value">{Math.floor(selectedActivity.movingTime / 60)} minutes</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Date:</span>
                      <span className="value">{new Date(selectedActivity.startDate).toLocaleDateString()}</span>
                    </div>
                    {selectedActivity.calories && (
                      <div className="detail-row">
                        <span className="label">Calories:</span>
                        <span className="value">{selectedActivity.calories}</span>
                      </div>
                    )}
                    {selectedActivity.perceivedExertion && (
                      <div className="detail-row">
                        <span className="label">Effort:</span>
                        <span className="value">{selectedActivity.perceivedExertion}</span>
                      </div>
                    )}
                    {selectedActivity.description && (
                      <div className="detail-row">
                        <span className="label">Description:</span>
                        <span className="value">{selectedActivity.description}</span>
                      </div>
                    )}
                    <div className="detail-row tags">
                      {selectedActivity.isCommute && <span className="tag commute">Commute</span>}
                      {selectedActivity.isIndoor && <span className="tag indoor">Indoor</span>}
                    </div>
                    <div className="detail-row">
                      <span className="label">Status:</span>
                      <span className="value">
                        {selectedActivity.isMock ? 'Mock Activity (Local Only)' : 'Synced with Strava'}
                      </span>
                    </div>
                  </div>
                  
                  {/* Add PhotoGallery to the activity details modal */}
                  <PhotoGallery 
                    photos={activityPhotos} 
                    activityId={selectedActivity?.id} 
                    onPhotoAdded={handlePhotoAdded} 
                    onPhotoDeleted={handlePhotoDeleted}
                    onPrimaryChanged={handlePrimaryChanged}
                  />
                  
                  <div className="modal-buttons">
                    <button onClick={handleEditActivity}>Edit</button>
                    <button onClick={() => {
                      setSelectedActivity(null);
                      setActivityPhotos([]);
                    }}>Close</button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Edit activity modal */}
            {editActivity && (
              <div className="activity-modal modal-overlay">
                <div className="activity-modal-content modal-content">
                  <h3>Edit Activity</h3>
                  
                  <div className="form-group">
                    <label>Activity Name</label>
                    <input 
                      type="text" 
                      value={editActivity.name}
                      onChange={(e) => setEditActivity({...editActivity, name: e.target.value})}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Description</label>
                    <textarea 
                      value={editActivity.description || ''}
                      onChange={(e) => setEditActivity({...editActivity, description: e.target.value})}
                      rows={3}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Perceived Exertion</label>
                    <select 
                      value={editActivity.perceivedExertion || ''}
                      onChange={(e) => setEditActivity({...editActivity, perceivedExertion: e.target.value})}
                    >
                      <option value="">Select effort level</option>
                      <option value="Easy">Easy</option>
                      <option value="Moderate">Moderate</option>
                      <option value="Max Effort">Max Effort</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>Private Notes</label>
                    <textarea 
                      value={editActivity.privateNotes || ''}
                      onChange={(e) => setEditActivity({...editActivity, privateNotes: e.target.value})}
                      rows={2}
                    />
                  </div>
                  
                  <div className="form-group checkbox-group">
                    <label>
                      <input 
                        type="checkbox"
                        checked={editActivity.isCommute || false}
                        onChange={(e) => setEditActivity({...editActivity, isCommute: e.target.checked})}
                      />
                      Commute
                    </label>
                    
                    <label>
                      <input 
                        type="checkbox"
                        checked={editActivity.isIndoor || false}
                        onChange={(e) => setEditActivity({...editActivity, isIndoor: e.target.checked})}
                      />
                      Indoor
                    </label>
                  </div>
                  
                  <div className="modal-buttons">
                    <button onClick={handleSaveActivity}>Save</button>
                    <button onClick={() => setEditActivity(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="connect-view">
            <h2>Connect Your Strava Account</h2>
            <p>Link your Strava account to sync activities and photos.</p>
            
            <button 
              className="strava-connect-button"
              onClick={connectStrava}
              disabled={isConnectingStrava}
            >
              {isConnectingStrava ? (
                "Connecting..."
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12.0002 2.40002L7.2002 12.0001H10.8002L12.0002 9.6L13.2002 12.0001H16.8002L12.0002 2.40002Z" fill="white"/>
                    <path d="M14.4 14.4001L13.2 12.0001L10.8 12.0001L9.6 14.4001L8.4 16.8001H11.9998H15.6L14.4 14.4001Z" fill="white"/>
                  </svg>
                  Connect with Strava
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default Dashboard;