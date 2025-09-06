import React, { useEffect, useRef, useState } from 'react';
import { Route, StreetViewFrame } from '../types';

interface RouteMapProps {
  route: Route | null;
  frames: StreetViewFrame[];
  currentFrame: number;
  isGoogleMapsLoaded: boolean;
}

export const RouteMap: React.FC<RouteMapProps> = ({
  route,
  frames,
  currentFrame,
  isGoogleMapsLoaded,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const currentPositionMarkerRef = useRef<google.maps.Marker | null>(null);
  const [isMapInitialized, setIsMapInitialized] = useState(false);

  useEffect(() => {
    if (!isGoogleMapsLoaded || !mapRef.current || !route || isMapInitialized) {
      return;
    }

    try {
      const map = new google.maps.Map(mapRef.current, {
        zoom: 13,
        center: route.start,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        fullscreenControl: false,
        streetViewControl: false,
      });

      const directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: false,
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
      setIsMapInitialized(true);
    } catch (error) {
      console.error('Failed to initialize map:', error);
    }
  }, [isGoogleMapsLoaded, route, isMapInitialized]);

  useEffect(() => {
    if (!currentPositionMarkerRef.current || !frames.length || currentFrame < 0) {
      return;
    }

    const frame = frames[currentFrame];
    if (frame) {
      const position = new google.maps.LatLng(frame.location.lat, frame.location.lng);
      currentPositionMarkerRef.current.setPosition(position);
      
      if (mapInstanceRef.current) {
        mapInstanceRef.current.panTo(position);
      }
    }
  }, [currentFrame, frames]);

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
      <div ref={mapRef} className="map-container" />
      <div className="map-info">
        <p>Current position: Frame {currentFrame + 1} of {frames.length}</p>
      </div>
    </div>
  );
};