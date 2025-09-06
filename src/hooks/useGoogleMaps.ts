import { useState, useEffect, useCallback } from 'react';
import { GoogleMapsService } from '../services/googleMaps';
import { Location, Route, StreetViewFrame } from '../types';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export const useGoogleMaps = () => {
  const [mapsService, setMapsService] = useState<GoogleMapsService | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeGoogleMaps = async () => {
      try {
        if (!GOOGLE_MAPS_API_KEY) {
          throw new Error('Google Maps API key is required');
        }

        if (typeof google === 'undefined') {
          await loadGoogleMapsScript();
        }

        const service = new GoogleMapsService(GOOGLE_MAPS_API_KEY);
        await service.initialize();
        setMapsService(service);
        setIsLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize Google Maps');
      }
    };

    initializeGoogleMaps();
  }, []);

  const loadGoogleMapsScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (typeof google !== 'undefined') {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Maps script'));
      document.head.appendChild(script);
    });
  };

  const getRoute = useCallback(async (start: Location, end: Location): Promise<Route | null> => {
    if (!mapsService) {
      setError('Google Maps service not initialized');
      return null;
    }

    try {
      const route = await mapsService.getRoute(start, end);
      return route;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get route');
      return null;
    }
  }, [mapsService]);

  const generateStreetViewFrames = useCallback(async (route: Route): Promise<StreetViewFrame[]> => {
    if (!mapsService) {
      setError('Google Maps service not initialized');
      return [];
    }

    try {
      const frames = await mapsService.generateStreetViewFrames(route);
      return frames;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate street view frames');
      return [];
    }
  }, [mapsService]);

  return {
    isLoaded,
    error,
    getRoute,
    generateStreetViewFrames,
    mapsService
  };
};