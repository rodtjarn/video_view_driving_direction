export interface Location {
  lat: number;
  lng: number;
  address?: string;
}

export interface RouteStep {
  location: Location;
  instruction: string;
  distance: number;
  duration: number;
  path?: google.maps.LatLng[];
}

export interface Route {
  start: Location;
  end: Location;
  steps: RouteStep[];
  totalDistance: number;
  totalDuration: number;
  encodedPath?: google.maps.LatLng[];
}

export interface StreetViewFrame {
  location: Location;
  heading: number;
  pitch: number;
  imageUrl: string;
  timestamp: number;
  isCached?: boolean;
  panoramaId?: string;
  isNearTurn?: boolean;
  turnDirection?: 'left' | 'right' | 'straight' | 'uturn';
  turnInstruction?: string;
}

export interface VideoPlayerState {
  isPlaying: boolean;
  currentFrame: number;
  totalFrames: number;
  playbackSpeed: number;
  progress: number;
}

export interface GoogleMapsConfig {
  apiKey: string;
  libraries: string[];
}