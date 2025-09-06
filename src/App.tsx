import React, { useState } from 'react';
import { LocationPicker } from './components/LocationPicker';
import { StreetViewPlayer } from './components/StreetViewPlayer';
import { RouteMap } from './components/RouteMap';
import { CacheProgress } from './components/CacheProgress';
import { useGoogleMaps } from './hooks/useGoogleMaps';
import { Location, Route, StreetViewFrame, VideoPlayerState } from './types';
import { CacheProgress as CacheProgressType } from './services/imageCache';
import './App.css';

function App() {
  const [startLocation, setStartLocation] = useState<Location | null>(null);
  const [endLocation, setEndLocation] = useState<Location | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [streetViewFrames, setStreetViewFrames] = useState<StreetViewFrame[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [playerState, setPlayerState] = useState<VideoPlayerState | null>(null);
  const [cacheProgress, setCacheProgress] = useState<CacheProgressType | null>(null);
  const [isCaching, setIsCaching] = useState(false);

  const { isLoaded, error, getRoute, generateStreetViewFramesWithCache } = useGoogleMaps();

  const handleGenerateVideo = async () => {
    if (!startLocation || !endLocation) {
      alert('Please select both start and end locations');
      return;
    }

    setIsLoading(true);
    setStreetViewFrames([]);
    
    try {
      const routeData = await getRoute(startLocation, endLocation);
      if (!routeData) {
        throw new Error('Failed to get route');
      }

      // Cost protection: limit route distance to 100 miles (160km)
      if (routeData.totalDistance > 160934) {
        throw new Error('Route too long (over 100 miles). Please select a shorter route to manage API costs.');
      }

      setRoute(routeData);
      
      // Start caching process
      setIsCaching(true);
      setCacheProgress(null);
      
      const frames = await generateStreetViewFramesWithCache(routeData, (progress) => {
        setCacheProgress(progress);
      });
      
      setStreetViewFrames(frames);
      
      // Hide cache progress after completion
      setTimeout(() => {
        setIsCaching(false);
        setCacheProgress(null);
      }, 3000);
      
    } catch (err) {
      console.error('Error generating video:', err);
      alert(err instanceof Error ? err.message : 'Failed to generate street view video');
    } finally {
      setIsLoading(false);
      setIsCaching(false);
      setCacheProgress(null);
    }
  };

  const canGenerateVideo = startLocation && endLocation && isLoaded && !isLoading;

  if (error) {
    return (
      <div className="app error">
        <h1>Street View Directions Video</h1>
        <div className="error-message">
          <p>Error: {error}</p>
          <p>Please check your Google Maps API key and try again.</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="app loading">
        <h1>Street View Directions Video</h1>
        <p>Loading Google Maps...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Street View Directions Video</h1>
        <p>Select start and end locations to generate a street view video of your route</p>
        <div className="cost-warning">
          <p><strong>⚠️ Cost Notice:</strong> This app uses Google Maps APIs which may incur charges. Routes are limited to 100 miles to manage costs.</p>
        </div>
      </header>

      <main className="app-main">
        <section className="location-section">
          <LocationPicker
            startLocation={startLocation}
            endLocation={endLocation}
            onStartLocationChange={setStartLocation}
            onEndLocationChange={setEndLocation}
            isGoogleMapsLoaded={isLoaded}
            googleMapsError={error}
          />
          
          <div className="generate-section">
            <button
              onClick={handleGenerateVideo}
              disabled={!canGenerateVideo}
              className="generate-btn"
            >
              {isLoading ? 'Generating...' : 'Generate Street View Video'}
            </button>
            
            {isLoading && (
              <div className="loading-info">
                <p>Calculating route and fetching street view images...</p>
                <p>This may take a few moments.</p>
              </div>
            )}
          </div>
        </section>

        <CacheProgress 
          progress={cacheProgress} 
          isVisible={isCaching} 
        />

        {route && (
          <section className="route-info">
            <h3>Route Information</h3>
            <p>Distance: {(route.totalDistance / 1000).toFixed(2)} km</p>
            <p>Duration: {Math.round(route.totalDuration / 60)} minutes</p>
            <p>Steps: {route.steps.length}</p>
          </section>
        )}

        {streetViewFrames.length > 0 && (
          <section className="player-section">
            <h3>Street View Video</h3>
            <div className="video-map-container">
              <StreetViewPlayer
                frames={streetViewFrames}
                onStateChange={setPlayerState}
              />
              <RouteMap
                route={route}
                frames={streetViewFrames}
                currentFrame={playerState?.currentFrame || 0}
                isGoogleMapsLoaded={isLoaded}
              />
            </div>
            
            {playerState && (
              <div className="player-info">
                <p>Frames: {playerState.totalFrames}</p>
                <p>Speed: {playerState.playbackSpeed}x</p>
                <p>Progress: {playerState.progress.toFixed(1)}%</p>
              </div>
            )}
          </section>
        )}

        {streetViewFrames.length === 0 && route && !isLoading && (
          <section className="no-frames">
            <p>No street view images were found for this route. Try a different route or check if street view is available in the selected area.</p>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;