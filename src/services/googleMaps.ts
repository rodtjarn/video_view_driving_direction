import { Location, Route, RouteStep, StreetViewFrame } from '../types';
import { imageCache, CacheProgress } from './imageCache';

export class GoogleMapsService {
  private directionsService: google.maps.DirectionsService | null = null;
  private streetViewService: google.maps.StreetViewService | null = null;

  constructor(private apiKey: string) {}

  async initialize(): Promise<void> {
    if (typeof google === 'undefined') {
      throw new Error('Google Maps API not loaded');
    }
    
    this.directionsService = new google.maps.DirectionsService();
    this.streetViewService = new google.maps.StreetViewService();
  }

  async getRoute(start: Location, end: Location): Promise<Route> {
    if (!this.directionsService) {
      throw new Error('Google Maps service not initialized');
    }

    return new Promise((resolve, reject) => {
      this.directionsService!.route({
        origin: start,
        destination: end,
        travelMode: google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          const route = this.parseDirectionsResult(result, start, end);
          resolve(route);
        } else {
          reject(new Error(`Failed to get route: ${status}`));
        }
      });
    });
  }

  private parseDirectionsResult(result: google.maps.DirectionsResult, start: Location, end: Location): Route {
    const leg = result.routes[0].legs[0];
    const steps: RouteStep[] = leg.steps.map(step => ({
      location: {
        lat: step.start_location.lat(),
        lng: step.start_location.lng()
      },
      instruction: step.instructions,
      distance: step.distance?.value || 0,
      duration: step.duration?.value || 0,
      path: step.path // Store the detailed path points
    }));

    return {
      start,
      end,
      steps,
      totalDistance: leg.distance?.value || 0,
      totalDuration: leg.duration?.value || 0,
      encodedPath: result.routes[0].overview_path // Store full route path
    };
  }

  async generateStreetViewFrames(route: Route, intervalMeters: number = 100): Promise<StreetViewFrame[]> {
    if (!this.streetViewService) {
      throw new Error('Street View service not initialized');
    }

    const frames: StreetViewFrame[] = [];
    const points = this.interpolateRoutePoints(route, intervalMeters);

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const nextPoint = points[i + 1];
      
      try {
        const heading = nextPoint ? this.calculateHeading(point, nextPoint) : 0;
        const imageUrl = await this.getStreetViewImage(point, heading);
        
        frames.push({
          location: point,
          heading,
          pitch: 0,
          imageUrl,
          timestamp: i
        });
      } catch (error) {
        console.warn(`Failed to get street view for point ${i}:`, error);
      }
    }

    return frames;
  }

  async generateStreetViewFramesWithCache(
    route: Route, 
    intervalMeters: number = 100,
    onProgress?: (progress: CacheProgress) => void
  ): Promise<StreetViewFrame[]> {
    if (!this.streetViewService) {
      throw new Error('Street View service not initialized');
    }

    // First generate frames with URLs
    const frames = await this.generateStreetViewFrames(route, intervalMeters);
    
    // Extract all image URLs for caching
    const imageUrls = frames.map(frame => frame.imageUrl);
    
    // Cache all images in the background
    const cachedUrls = await imageCache.cacheImages(imageUrls, onProgress);
    
    // Update frames with cached URLs where available
    const updatedFrames = frames.map(frame => ({
      ...frame,
      imageUrl: cachedUrls.get(frame.imageUrl) || frame.imageUrl,
      isCached: cachedUrls.has(frame.imageUrl)
    }));

    return updatedFrames;
  }

  private interpolateRoutePoints(route: Route, intervalMeters: number): Location[] {
    const points: Location[] = [];
    
    // Use the detailed path from Google's directions if available
    if (route.encodedPath && route.encodedPath.length > 0) {
      let accumulatedDistance = 0;
      const firstPoint = { lat: route.encodedPath[0].lat(), lng: route.encodedPath[0].lng() };
      points.push(firstPoint); // Add first point
      
      for (let i = 1; i < route.encodedPath.length; i++) {
        const prevPoint = { lat: route.encodedPath[i - 1].lat(), lng: route.encodedPath[i - 1].lng() };
        const currentPoint = { lat: route.encodedPath[i].lat(), lng: route.encodedPath[i].lng() };
        const segmentDistance = this.calculateDistance(prevPoint, currentPoint);
        
        accumulatedDistance += segmentDistance;
        
        // Add point if we've traveled enough distance
        if (accumulatedDistance >= intervalMeters) {
          points.push(currentPoint);
          accumulatedDistance = 0;
        }
      }
      
      // Always add the last point
      const lastPoint = { lat: route.encodedPath[route.encodedPath.length - 1].lat(), lng: route.encodedPath[route.encodedPath.length - 1].lng() };
      if (points[points.length - 1] !== lastPoint) {
        points.push(lastPoint);
      }
    } else {
      // Fallback to step-based interpolation
      let accumulatedDistance = 0;

      for (let i = 0; i < route.steps.length - 1; i++) {
        const start = route.steps[i].location;
        const end = route.steps[i + 1].location;
        const stepDistance = route.steps[i].distance;

        if (points.length === 0) {
          points.push(start);
        }

        const segmentPoints = this.interpolateSegment(start, end, intervalMeters, accumulatedDistance);
        points.push(...segmentPoints);
        accumulatedDistance += stepDistance;
      }
    }

    return points;
  }

  private interpolateSegment(start: Location, end: Location, intervalMeters: number, startDistance: number): Location[] {
    const points: Location[] = [];
    const segmentDistance = this.calculateDistance(start, end);
    const numPoints = Math.floor(segmentDistance / intervalMeters);

    for (let i = 1; i <= numPoints; i++) {
      const ratio = i / numPoints;
      const interpolatedPoint = {
        lat: start.lat + (end.lat - start.lat) * ratio,
        lng: start.lng + (end.lng - start.lng) * ratio
      };
      points.push(interpolatedPoint);
    }

    return points;
  }

  private calculateDistance(point1: Location, point2: Location): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLng = (point2.lng - point1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private calculateHeading(from: Location, to: Location): number {
    const dLng = (to.lng - from.lng) * Math.PI / 180;
    const fromLatRad = from.lat * Math.PI / 180;
    const toLatRad = to.lat * Math.PI / 180;
    
    const y = Math.sin(dLng) * Math.cos(toLatRad);
    const x = Math.cos(fromLatRad) * Math.sin(toLatRad) -
      Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(dLng);
    
    let heading = Math.atan2(y, x) * 180 / Math.PI;
    return (heading + 360) % 360;
  }

  private async getStreetViewImage(location: Location, heading: number): Promise<string> {
    const size = '640x640';
    const fov = '90';
    const pitch = '0';
    
    const url = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${location.lat},${location.lng}&heading=${heading}&pitch=${pitch}&fov=${fov}&key=${this.apiKey}`;
    
    return url;
  }

  async checkStreetViewAvailability(location: Location): Promise<boolean> {
    if (!this.streetViewService) {
      throw new Error('Street View service not initialized');
    }

    return new Promise((resolve) => {
      this.streetViewService!.getPanorama({
        location: location,
        radius: 50
      }, (data, status) => {
        resolve(status === google.maps.StreetViewStatus.OK);
      });
    });
  }
}