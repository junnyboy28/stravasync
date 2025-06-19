import React, { useState } from 'react';
import '../styles/photo-gallery.css';
import { auth } from '../firebase'; // Add this import

const PhotoGallery = ({ photos, activityId, onPhotoAdded, onPhotoDeleted, onPrimaryChanged }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [caption, setCaption] = useState('');

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // Update the upload photo function
  const uploadPhoto = async () => {
    if (!selectedFile) {
      alert("Please select a file to upload");
      return;
    }
    
    // Validate file type on client side first
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(selectedFile.type)) {
      alert(`File type not supported. Please upload a valid image file (JPEG, PNG, GIF, etc). Received: ${selectedFile.type}`);
      return;
    }
    
    try {
      setIsUploading(true);
      
      const token = await auth.currentUser.getIdToken();
      
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `http://localhost:3001/photos/${activityId}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentCompleted = Math.round((event.loaded * 100) / event.total);
          setUploadProgress(percentCompleted);
        }
      });

      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            console.log("Photo uploaded successfully:", data);
            
            // Reset form
            setSelectedFile(null);
            setCaption('');
            setShowUploadModal(false);
            
            // Notify parent component with the new photo data
            if (onPhotoAdded) onPhotoAdded(data);
          } catch (parseError) {
            throw new Error(`Error parsing response: ${parseError.message}`);
          }
        } else {
          let errorMessage = `Server responded with ${xhr.status}`;
          try {
            const errorData = JSON.parse(xhr.responseText);
            errorMessage = errorData.message || errorMessage;
          } catch (e) {
            // If the response isn't valid JSON, use the default error message
          }
          throw new Error(errorMessage);
        }
      };

      xhr.onerror = function() {
        throw new Error('Network error occurred');
      };

      const formData = new FormData();
      formData.append('photo', selectedFile);
      if (caption) formData.append('caption', caption);

      xhr.send(formData);
      
    } catch (error) {
      console.error("Error uploading photo:", error);
      alert(`Failed to upload photo: ${error.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Update the deletePhoto function
  const deletePhoto = async (photoId) => {
    if (!window.confirm('Are you sure you want to delete this photo? Note: If this activity is synced with Strava, the photo will be removed from your app but will remain on Strava.')) 
      return;
    
    try {
      const token = await auth.currentUser.getIdToken();
      
      const response = await fetch(`http://localhost:3001/photos/${photoId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      // Notify parent component
      if (onPhotoDeleted) onPhotoDeleted(photoId);
      
    } catch (error) {
      console.error("Error deleting photo:", error);
      alert(`Failed to delete photo: ${error.message}`);
    }
  };

  const setPrimaryPhoto = async (photoId) => {
    try {
      const token = await auth.currentUser.getIdToken();
      
      const response = await fetch(`http://localhost:3001/photos/${photoId}/primary`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      
      // Notify parent component
      if (onPrimaryChanged) onPrimaryChanged(data);
      
    } catch (error) {
      console.error("Error setting primary photo:", error);
      alert(`Failed to set primary photo: ${error.message}`);
    }
  };

  return (
    <div className="photo-gallery">
      <h4>Photos</h4>
      
      {photos && photos.length > 0 ? (
        <div className="photo-grid">
          {photos.map(photo => {
            console.log("Rendering photo:", photo);
            return (
              <div key={photo.id} className={`photo-item ${photo.isPrimary ? 'primary' : ''}`}>
                <img 
                  src={photo.url} 
                  alt={photo.caption || 'Activity photo'} 
                  onError={(e) => {
                    console.error(`Failed to load image: ${photo.url}`);
                    e.target.src = 'https://via.placeholder.com/300?text=Photo+Not+Found';
                  }}
                />
                
                {photo.caption && (
                  <div className="photo-caption">{photo.caption}</div>
                )}
                
                <div className="photo-actions">
                  {!photo.isPrimary && (
                    <button 
                      onClick={() => setPrimaryPhoto(photo.id)}
                      className="btn-primary"
                      title="Set as primary photo"
                    >
                      📌
                    </button>
                  )}
                  <button 
                    onClick={() => deletePhoto(photo.id)}
                    className="btn-delete"
                    title="Delete photo"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="no-photos">No photos for this activity</p>
      )}
      
      <button 
        className="add-photo-btn"
        onClick={() => setShowUploadModal(true)}
      >
        Add Photo
      </button>
      
      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal">
          <div className="modal-content">
            <h3>Upload Photo</h3>
            
            <div className="form-group">
              <label>Select Photo</label>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileChange}
              />
              <small style={{display: 'block', marginTop: '5px', color: '#666'}}>
                Supported formats: JPEG, PNG, GIF, BMP, WebP
              </small>
            </div>
            
            <div className="form-group">
              <label>Caption (optional)</label>
              <input 
                type="text" 
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption..."
              />
            </div>
            
            {isUploading && (
              <div className="progress-bar">
                <div 
                  className="progress" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
                <span>{uploadProgress}%</span>
              </div>
            )}
            
            <div className="modal-buttons">
              <button 
                onClick={uploadPhoto}
                disabled={!selectedFile || isUploading}
              >
                {isUploading ? 'Uploading...' : 'Upload'}
              </button>
              <button onClick={() => setShowUploadModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoGallery;