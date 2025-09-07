import React, { useEffect, useRef, useState } from 'react';
import { Route, StreetViewFrame } from '../types';

interface RouteMapProps {
  route: Route | null;
  frames: StreetViewFrame[];
  currentFrame: number;
  isGoogleMapsLoaded: boolean;
  isPlaying?: boolean;
}

export const RouteMap: React.FC<RouteMapProps> = ({
  route,
  frames,
  currentFrame,
  isGoogleMapsLoaded,
  isPlaying = false,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const currentPositionMarkerRef = useRef<google.maps.Marker | null>(null);
  const streetViewRef = useRef<HTMLDivElement>(null);
  const streetViewPanoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [isMapInitialized, setIsMapInitialized] = useState(false);
  const [showStreetView, setShowStreetView] = useState(false);

  useEffect(() => {
    if (!isGoogleMapsLoaded || !mapRef.current || !route || isMapInitialized) {
      return;
    }

    try {
      const map = new google.maps.Map(mapRef.current, {
        zoom: 18, // Increased to 18 for maximum turn detail visibility
        center: route.start,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        fullscreenControl: false,
        streetViewControl: true, // Enable Street View control (pegman)
      });

      const directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: false,
        preserveViewport: false, // Allow initial auto-fit to show full route
        polylineOptions: {
          strokeColor: '#4285F4',
          strokeWeight: 5,
          strokeOpacity: 0.8,
        },
      });

      directionsRenderer.setMap(map);
      mapInstanceRef.current = map;
      directionsRendererRef.current = directionsRenderer;

      const directionsService = new google.maps.DirectionsService();
      directionsService.route(
        {
          origin: route.start,
          destination: route.end,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            directionsRenderer.setDirections(result);
            // Start with full route view - DirectionsRenderer will auto-fit initially
          }
        }
      );

      const currentPositionMarker = new google.maps.Marker({
        position: route.start,
        map: map,
        title: 'Current Position',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#FF0000',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
        zIndex: 1000,
      });

      currentPositionMarkerRef.current = currentPositionMarker;

      // Initialize Street View panorama
      if (streetViewRef.current) {
        const streetViewPanorama = new google.maps.StreetViewPanorama(streetViewRef.current, {
          position: route.start,
          pov: {
            heading: 0,
            pitch: 0
          },
          zoom: 1,
          visible: showStreetView
        });
        
        map.setStreetView(streetViewPanorama);
        streetViewPanoramaRef.current = streetViewPanorama;
      }

      setIsMapInitialized(true);
    } catch (error) {
      console.error('Failed to initialize map:', error);
    }
  }, [isGoogleMapsLoaded, route, isMapInitialized, showStreetView]);

  useEffect(() => {
    if (!currentPositionMarkerRef.current || !frames.length || currentFrame < 0) {
      return;
    }

    const frame = frames[currentFrame];
    if (frame) {
      const position = new google.maps.LatLng(frame.location.lat, frame.location.lng);
      currentPositionMarkerRef.current.setPosition(position);
      
      if (mapInstanceRef.current) {
        if (isPlaying) {
          // When playing, zoom in and follow position for turn visibility
          mapInstanceRef.current.panTo(position);
          if (mapInstanceRef.current.getZoom() < 18) {
            mapInstanceRef.current.setZoom(18);
          }
        } else {
          // When not playing, just update marker position without changing zoom/pan
          // Keep full route view visible
        }
      }

      // Update Street View panorama position if it exists
      if (streetViewPanoramaRef.current && showStreetView) {
        streetViewPanoramaRef.current.setPosition(position);
        if (frame.heading !== undefined) {
          streetViewPanoramaRef.current.setPov({
            heading: frame.heading,
            pitch: frame.pitch || 0
          });
        }
      }
    }
  }, [currentFrame, frames, showStreetView, isPlaying]);

  if (!isGoogleMapsLoaded) {
    return (
      <div className="route-map loading">
        <p>Loading map...</p>
      </div>
    );
  }

  if (!route) {
    return (
      <div className="route-map no-route">
        <p>Generate a route to view the map</p>
      </div>
    );
  }

  return (
    <div className="route-map">
      <div className="map-controls">
        <button 
          onClick={() => setShowStreetView(!showStreetView)}
          className={`street-view-toggle ${showStreetView ? 'active' : ''}`}
        >
          {showStreetView ? '🗺️ Show Map' : '👁️ Show Street View'}
        </button>
      </div>
      
      <div className="map-container-wrapper">
        <div ref={mapRef} className={`map-container ${showStreetView ? 'split-view' : ''}`} />
        {showStreetView && (
          <div ref={streetViewRef} className="street-view-container" />
        )}
      </div>
      
      <div className="map-info">
        <p>Current position: Frame {currentFrame + 1} of {frames.length}</p>
        {showStreetView && (
          <p>💡 You can also drag the pegman (little person) on the map to explore Street View anywhere!</p>
        )}
      </div>
    </div>
  );
};