import React from 'react';
import { CacheProgress as CacheProgressType } from '../services/imageCache';

interface CacheProgressProps {
  progress: CacheProgressType | null;
  isVisible: boolean;
}

export const CacheProgress: React.FC<CacheProgressProps> = ({ progress, isVisible }) => {
  if (!isVisible || !progress) {
    return null;
  }

  const { total, cached, failed, percentage } = progress;
  const remaining = total - cached - failed;

  return (
    <div className="cache-progress">
      <div className="cache-progress-header">
        <h3>Caching Street View Images</h3>
        <span className="cache-progress-percentage">{Math.round(percentage)}%</span>
      </div>
      
      <div className="cache-progress-bar">
        <div 
          className="cache-progress-fill" 
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      <div className="cache-progress-stats">
        <span className="cache-stat cached">✓ Cached: {cached}</span>
        <span className="cache-stat remaining">⏳ Remaining: {remaining}</span>
        {failed > 0 && <span className="cache-stat failed">✗ Failed: {failed}</span>}
      </div>
      
      <p className="cache-progress-message">
        {percentage < 100 
          ? "Caching images for faster playback... This may take a moment." 
          : "Caching complete! Images will now load faster during playback."
        }
      </p>
    </div>
  );
};