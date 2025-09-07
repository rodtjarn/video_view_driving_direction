import React, { useRef, useEffect, useState } from 'react';
import { Location } from '../types';

interface LocationPickerProps {
  onStartLocationChange: (location: Location | null) => void;
  onEndLocationChange: (location: Location | null) => void;
  startLocation: Location | null;
  endLocation: Location | null;
  isGoogleMapsLoaded?: boolean;
  googleMapsError?: string | null;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  onStartLocationChange,
  onEndLocationChange,
  startLocation,
  endLocation,
  isGoogleMapsLoaded = false,
  googleMapsError = null,
}) => {
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const [startAutocomplete, setStartAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [endAutocomplete, setEndAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!isGoogleMapsLoaded || typeof google === 'undefined' || !google.maps?.places) {
      return;
    }

    // Add a small delay to ensure Places library is fully loaded
    const initializeAutocomplete = () => {
      // Only initialize if not already initialized
      if (!startAutocomplete && startInputRef.current) {
        try {
          const autocomplete = new google.maps.places.Autocomplete(startInputRef.current);
          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry?.location) {
              const location: Location = {
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
                address: place.formatted_address || place.name
              };
              onStartLocationChange(location);
            }
          });
          setStartAutocomplete(autocomplete);
        } catch (error) {
          console.error('Failed to initialize start location autocomplete:', error);
          // Retry after a short delay
          setTimeout(initializeAutocomplete, 1000);
          return;
        }
      }

      // Only initialize if not already initialized
      if (!endAutocomplete && endInputRef.current) {
        try {
          const autocomplete = new google.maps.places.Autocomplete(endInputRef.current);
          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry?.location) {
              const location: Location = {
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
                address: place.formatted_address || place.name
              };
              onEndLocationChange(location);
            }
          });
          setEndAutocomplete(autocomplete);
        } catch (error) {
          console.error('Failed to initialize end location autocomplete:', error);
          // Retry after a short delay
          setTimeout(initializeAutocomplete, 1000);
          return;
        }
      }
    };

    // Small delay to ensure Places API is fully ready
    setTimeout(initializeAutocomplete, 100);

    return () => {
      // Cleanup on unmount only
      if (startAutocomplete) {
        google.maps.event.clearInstanceListeners(startAutocomplete);
      }
      if (endAutocomplete) {
        google.maps.event.clearInstanceListeners(endAutocomplete);
      }
    };
  }, [isGoogleMapsLoaded]); // Removed circular dependencies

  const handleStartInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) {
      onStartLocationChange(null);
    }
  };

  const handleEndInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) {
      onEndLocationChange(null);
    }
  };

  return (
    <div className="location-picker">
      <div className="api-status">
        {googleMapsError ? (
          <div className="status error">
            ❌ Google Maps API Error: {googleMapsError}
          </div>
        ) : isGoogleMapsLoaded ? (
          <div className="status success">
            ✅ Google Maps loaded - Autocomplete enabled
          </div>
        ) : (
          <div className="status loading">
            ⏳ Loading Google Maps API...
          </div>
        )}
      </div>
      
      <div className="input-group">
        <label htmlFor="start-location">Start Location:</label>
        <input
          ref={startInputRef}
          id="start-location"
          type="text"
          placeholder={isGoogleMapsLoaded ? "Start typing an address..." : "Loading autocomplete..."}
          onChange={handleStartInputChange}
          className="location-input"
          disabled={!isGoogleMapsLoaded}
        />
      </div>
      
      <div className="input-group">
        <label htmlFor="end-location">End Location:</label>
        <input
          ref={endInputRef}
          id="end-location"
          type="text"
          placeholder={isGoogleMapsLoaded ? "Start typing an address..." : "Loading autocomplete..."}
          onChange={handleEndInputChange}
          className="location-input"
          disabled={!isGoogleMapsLoaded}
        />
      </div>

      {startLocation && endLocation && (
        <div className="selected-locations">
          <p><strong>From:</strong> {startLocation.address || `${startLocation.lat}, ${startLocation.lng}`}</p>
          <p><strong>To:</strong> {endLocation.address || `${endLocation.lat}, ${endLocation.lng}`}</p>
        </div>
      )}
    </div>
  );
};