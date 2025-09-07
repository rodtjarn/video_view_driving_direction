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
    const seenLocations = new Set<string>();

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const nextPoint = points[i + 1];
      
      try {
        const heading = nextPoint ? this.calculateHeading(point, nextPoint) : 0;
        const imageUrl = await this.getStreetViewImage(point, heading);
        
        // Simple location-based deduplication to avoid adjacent duplicate coordinates
        const locationKey = `${Math.round(point.lat * 10000)},${Math.round(point.lng * 10000)}`;
        if (seenLocations.has(locationKey)) {
          continue;
        }
        seenLocations.add(locationKey);
        
        // Check if this point is near a turn instruction and get turn details
        const turnInfo = this.getTurnInformation(point, route.steps);
        
        frames.push({
          location: point,
          heading,
          pitch: 0,
          imageUrl,
          timestamp: i,
          isNearTurn: turnInfo.isNearTurn,
          turnDirection: turnInfo.direction,
          turnInstruction: turnInfo.instruction
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

    // First generate deduplicated frames with URLs
    const frames = await this.generateStreetViewFrames(route, intervalMeters);
    
    if (frames.length === 0) {
      return frames;
    }
    
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
    const turnDensity = 100; // Number of extra images before/after each turn (ultra-smooth turns)
    const straightInterval = intervalMeters * 5; // 5x normal interval for straight roads (80% fewer images)
    
    // Use Google's detailed path to stay on roads, but adjust density based on turn instructions
    if (route.encodedPath && route.encodedPath.length > 0) {
      let accumulatedDistance = 0;
      const firstPoint = { lat: route.encodedPath[0].lat(), lng: route.encodedPath[0].lng() };
      points.push(firstPoint);
      
      for (let i = 1; i < route.encodedPath.length; i++) {
        const prevPoint = { lat: route.encodedPath[i - 1].lat(), lng: route.encodedPath[i - 1].lng() };
        const currentPoint = { lat: route.encodedPath[i].lat(), lng: route.encodedPath[i].lng() };
        const segmentDistance = this.calculateDistance(prevPoint, currentPoint);
        
        accumulatedDistance += segmentDistance;
        
        // Check if we're near a turn instruction location
        const nearTurn = this.isNearTurnInstruction(currentPoint, route.steps);
        const currentInterval = nearTurn ? intervalMeters / turnDensity : straightInterval;
        
        if (accumulatedDistance >= currentInterval) {
          points.push(currentPoint);
          accumulatedDistance = 0;
        }
      }
      
      // Always add the last point
      const lastPoint = { lat: route.encodedPath[route.encodedPath.length - 1].lat(), lng: route.encodedPath[route.encodedPath.length - 1].lng() };
      if (points[points.length - 1] !== lastPoint) {
        points.push(lastPoint);
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

  async getPanoramaMetadata(location: Location): Promise<{ panoId: string; location: Location; imageDate?: string } | null> {
    if (!this.streetViewService) {
      throw new Error('Street View service not initialized');
    }

    return new Promise((resolve) => {
      this.streetViewService!.getPanorama({
        location: location,
        radius: 50
      }, (data, status) => {
        if (status === google.maps.StreetViewStatus.OK && data) {
          resolve({
            panoId: data.location!.pano!,
            location: {
              lat: data.location!.latLng!.lat(),
              lng: data.location!.latLng!.lng()
            },
            imageDate: data.imageDate || undefined
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  async findBestPanoramaInRadius(location: Location, radius: number = 100): Promise<{ panoId: string; location: Location; imageDate?: string } | null> {
    const candidates: Array<{ panoId: string; location: Location; imageDate?: string; distance: number }> = [];
    
    // Search in a much smaller pattern - just 5 key points for speed
    const searchPoints = [
      location, // Center
      { lat: location.lat + 0.0005, lng: location.lng }, // ~55m north
      { lat: location.lat - 0.0005, lng: location.lng }, // ~55m south  
      { lat: location.lat, lng: location.lng + 0.0005 }, // ~55m east
      { lat: location.lat, lng: location.lng - 0.0005 }  // ~55m west
    ];
    
    for (const searchPoint of searchPoints) {
      try {
        const panoramaData = await this.getPanoramaMetadata(searchPoint);
        if (panoramaData) {
          const distance = this.calculateDistance(location, panoramaData.location);
          // Only consider panoramas within the specified radius
          if (distance <= radius) {
            candidates.push({
              ...panoramaData,
              distance
            });
          }
        }
      } catch (error) {
        // Continue searching other points
      }
    }
    
    if (candidates.length === 0) {
      return null;
    }
    
    // Remove duplicates based on panoId
    const uniqueCandidates = candidates.filter((candidate, index, array) => 
      array.findIndex(c => c.panoId === candidate.panoId) === index
    );
    
    // Sort by image date (newest first), then by distance (closest first)
    const sortedCandidates = uniqueCandidates.sort((a, b) => {
      // Compare dates if both have them
      if (a.imageDate && b.imageDate) {
        const dateA = new Date(a.imageDate);
        const dateB = new Date(b.imageDate);
        if (dateB.getTime() !== dateA.getTime()) {
          return dateB.getTime() - dateA.getTime(); // Newer first
        }
      }
      
      // If dates are equal or missing, prefer closer distance
      return a.distance - b.distance;
    });
    
    return sortedCandidates[0];
  }

  private isTurnSegment(path: google.maps.LatLng[], index: number): boolean {
    // Check if we're near a turn by looking at a wider range of points
    const lookAhead = 5; // Look 5 points ahead and behind
    const minIndex = Math.max(0, index - lookAhead);
    const maxIndex = Math.min(path.length - 1, index + lookAhead);
    
    // If we don't have enough points, consider it a turn to be safe
    if (maxIndex - minIndex < 3) return true;
    
    let maxHeadingChange = 0;
    
    // Check heading changes in the surrounding area
    for (let i = minIndex; i < maxIndex - 1; i++) {
      if (i + 2 < path.length) {
        const p1 = { lat: path[i].lat(), lng: path[i].lng() };
        const p2 = { lat: path[i + 1].lat(), lng: path[i + 1].lng() };
        const p3 = { lat: path[i + 2].lat(), lng: path[i + 2].lng() };
        
        const heading1 = this.calculateHeading(p1, p2);
        const heading2 = this.calculateHeading(p2, p3);
        
        let headingDiff = Math.abs(heading2 - heading1);
        if (headingDiff > 180) headingDiff = 360 - headingDiff;
        
        maxHeadingChange = Math.max(maxHeadingChange, headingDiff);
      }
    }
    
    // Hyper-sensitive threshold - consider it a turn if heading changes more than 1 degree
    return maxHeadingChange > 1;
  }

  private isStepATurn(instruction: string): boolean {
    const turnKeywords = ['turn', 'left', 'right', 'exit', 'ramp', 'merge', 'fork'];
    const lowerInstruction = instruction.toLowerCase();
    return turnKeywords.some(keyword => lowerInstruction.includes(keyword));
  }

  private getPointAtDistance(start: Location, end: Location, distanceMeters: number): Location | null {
    const totalDistance = this.calculateDistance(start, end);
    if (totalDistance === 0) return null;
    
    const ratio = Math.abs(distanceMeters) / totalDistance;
    if (ratio > 1) return null;
    
    const direction = distanceMeters >= 0 ? 1 : -1;
    const adjustedRatio = ratio * direction;
    
    return {
      lat: start.lat + (end.lat - start.lat) * adjustedRatio,
      lng: start.lng + (end.lng - start.lng) * adjustedRatio
    };
  }

  private isNearTurnInstruction(point: Location, steps: RouteStep[]): boolean {
    const turnRadius = 30; // meters - consider points within 30m of a turn instruction
    
    for (const step of steps) {
      if (this.isStepATurn(step.instruction)) {
        const distance = this.calculateDistance(point, step.location);
        if (distance <= turnRadius) {
          return true;
        }
      }
    }
    
    return false;
  }

  private getTurnInformation(point: Location, steps: RouteStep[]): { isNearTurn: boolean; direction?: 'left' | 'right' | 'straight' | 'uturn'; instruction?: string } {
    const turnRadius = 30; // meters - consider points within 30m of a turn instruction
    
    for (const step of steps) {
      if (this.isStepATurn(step.instruction)) {
        const distance = this.calculateDistance(point, step.location);
        if (distance <= turnRadius) {
          return {
            isNearTurn: true,
            direction: this.extractTurnDirection(step.instruction),
            instruction: step.instruction
          };
        }
      }
    }
    
    return { isNearTurn: false };
  }

  private extractTurnDirection(instruction: string): 'left' | 'right' | 'straight' | 'uturn' {
    const lowerInstruction = instruction.toLowerCase();
    
    if (lowerInstruction.includes('u-turn') || lowerInstruction.includes('make a u-turn')) {
      return 'uturn';
    } else if (lowerInstruction.includes('turn left') || lowerInstruction.includes('left onto')) {
      return 'left';
    } else if (lowerInstruction.includes('turn right') || lowerInstruction.includes('right onto')) {
      return 'right';
    } else if (lowerInstruction.includes('continue') || lowerInstruction.includes('straight')) {
      return 'straight';
    } else if (lowerInstruction.includes('left')) {
      return 'left';
    } else if (lowerInstruction.includes('right')) {
      return 'right';
    }
    
    return 'straight'; // Default fallback
  }

  private generateSearchGrid(center: Location, radiusMeters: number, pointsPerDirection: number): Location[] {
    const points: Location[] = [center]; // Include the center point
    
    // Convert meters to approximate degrees (very rough approximation)
    const metersPerDegree = 111320; // Rough approximation at equator
    const radiusDegrees = radiusMeters / metersPerDegree;
    
    // Generate points in a grid pattern
    for (let i = 1; i <= pointsPerDirection; i++) {
      const stepSize = (radiusDegrees / pointsPerDirection) * i;
      
      // Cardinal directions
      points.push({ lat: center.lat + stepSize, lng: center.lng }); // North
      points.push({ lat: center.lat - stepSize, lng: center.lng }); // South  
      points.push({ lat: center.lat, lng: center.lng + stepSize }); // East
      points.push({ lat: center.lat, lng: center.lng - stepSize }); // West
      
      // Diagonal directions for better coverage
      points.push({ lat: center.lat + stepSize, lng: center.lng + stepSize }); // NE
      points.push({ lat: center.lat + stepSize, lng: center.lng - stepSize }); // NW
      points.push({ lat: center.lat - stepSize, lng: center.lng + stepSize }); // SE
      points.push({ lat: center.lat - stepSize, lng: center.lng - stepSize }); // SW
    }
    
    return points;
  }
}