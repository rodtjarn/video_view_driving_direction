import React, { useState, useEffect, useRef } from 'react';
import { StreetViewFrame, VideoPlayerState } from '../types';
import { imageCache } from '../services/imageCache';

interface StreetViewPlayerProps {
  frames: StreetViewFrame[];
  onStateChange?: (state: VideoPlayerState) => void;
}

export const StreetViewPlayer: React.FC<StreetViewPlayerProps> = ({
  frames,
  onStateChange,
}) => {
  const [playerState, setPlayerState] = useState<VideoPlayerState>({
    isPlaying: false,
    currentFrame: 0,
    totalFrames: frames.length,
    playbackSpeed: 1,
    progress: 0,
  });
  
  const [lastSuccessfulImageUrl, setLastSuccessfulImageUrl] = useState<string | null>(null);
  const [cachedImageUrls, setCachedImageUrls] = useState<Map<string, string>>(new Map());

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setPlayerState(prev => ({
      ...prev,
      totalFrames: frames.length,
      currentFrame: 0,
      progress: 0,
    }));
    
    // Check for cached images when frames change
    const checkCachedImages = async () => {
      const newCachedUrls = new Map<string, string>();
      
      for (const frame of frames) {
        try {
          const cachedUrl = await imageCache.getCachedImage(frame.imageUrl);
          if (cachedUrl) {
            newCachedUrls.set(frame.imageUrl, cachedUrl);
          }
        } catch (error) {
          console.warn('Failed to check cached image:', error);
        }
      }
      
      setCachedImageUrls(newCachedUrls);
    };
    
    if (frames.length > 0) {
      checkCachedImages();
    }
  }, [frames]);

  useEffect(() => {
    if (onStateChange) {
      onStateChange(playerState);
    }
  }, [playerState, onStateChange]);

  useEffect(() => {
    if (playerState.isPlaying && frames.length > 0) {
      const frameRate = 1000 / (10 * playerState.playbackSpeed); // 10 FPS base rate
      intervalRef.current = setInterval(() => {
        setPlayerState(prev => {
          const nextFrame = prev.currentFrame + 1;
          if (nextFrame >= frames.length) {
            return {
              ...prev,
              isPlaying: false,
              currentFrame: frames.length - 1,
              progress: 100,
            };
          }
          return {
            ...prev,
            currentFrame: nextFrame,
            progress: (nextFrame / frames.length) * 100,
          };
        });
      }, frameRate);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [playerState.isPlaying, playerState.playbackSpeed, frames.length]);

  const togglePlayPause = () => {
    setPlayerState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  };

  const seekToFrame = (frameIndex: number) => {
    const clampedFrame = Math.max(0, Math.min(frameIndex, frames.length - 1));
    setPlayerState(prev => ({
      ...prev,
      currentFrame: clampedFrame,
      progress: (clampedFrame / frames.length) * 100,
    }));
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progressPercent = (clickX / rect.width) * 100;
    const targetFrame = Math.floor((progressPercent / 100) * frames.length);
    seekToFrame(targetFrame);
  };

  const changePlaybackSpeed = (speed: number) => {
    setPlayerState(prev => ({ ...prev, playbackSpeed: speed }));
  };

  const reset = () => {
    setPlayerState(prev => ({
      ...prev,
      isPlaying: false,
      currentFrame: 0,
      progress: 0,
    }));
  };

  const currentFrame = frames[playerState.currentFrame];
  
  // Get the best available image URL (cached first, then original, then fallback)
  const getImageUrl = () => {
    if (!currentFrame) return lastSuccessfulImageUrl || '';
    
    const cachedUrl = cachedImageUrls.get(currentFrame.imageUrl);
    return cachedUrl || currentFrame.imageUrl;
  };

  if (frames.length === 0) {
    return (
      <div className="street-view-player">
        <div className="no-frames">
          <p>No street view frames available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="street-view-player">
      <div className="video-container">
        {(currentFrame || lastSuccessfulImageUrl) && (
          <img
            ref={imageRef}
            src={getImageUrl()}
            alt={`Street view frame ${playerState.currentFrame + 1}`}
            className="street-view-image"
            onLoad={() => {
              const imageUrl = getImageUrl();
              if (imageUrl) {
                setLastSuccessfulImageUrl(imageUrl);
              }
            }}
            onError={async () => {
              console.warn(`Failed to load frame ${playerState.currentFrame}`);
              
              // Try to fallback to cached version if original failed
              if (currentFrame && !cachedImageUrls.has(currentFrame.imageUrl)) {
                try {
                  const cachedUrl = await imageCache.getCachedImage(currentFrame.imageUrl);
                  if (cachedUrl) {
                    setCachedImageUrls(prev => new Map(prev).set(currentFrame.imageUrl, cachedUrl));
                  }
                } catch (error) {
                  console.warn('Failed to get cached fallback:', error);
                }
              }
            }}
          />
        )}
        
        <div className="frame-info">
          Frame {playerState.currentFrame + 1} of {frames.length}
        </div>
      </div>

      <div className="player-controls">
        <div className="playback-controls">
          <button onClick={togglePlayPause} className="play-pause-btn">
            {playerState.isPlaying ? '⏸️' : '▶️'}
          </button>
          
          <button onClick={reset} className="reset-btn">
            ⏹️
          </button>
          
          <div className="speed-controls">
            <label>Speed:</label>
            {[0.1, 0.25, 0.5, 1, 1.5, 2].map(speed => (
              <button
                key={speed}
                onClick={() => changePlaybackSpeed(speed)}
                className={playerState.playbackSpeed === speed ? 'active' : ''}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        <div className="progress-container" onClick={handleProgressBarClick}>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${playerState.progress}%` }}
            />
          </div>
          <div className="time-display">
            {Math.floor(playerState.currentFrame / 10)}s / {Math.floor(frames.length / 10)}s
          </div>
        </div>
      </div>
    </div>
  );
};