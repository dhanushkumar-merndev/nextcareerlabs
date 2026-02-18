/**
 * Calculate recommended sprite count based on video duration
 * Following the tier system from requirements
 */
export function getSpriteCount(durationSeconds: number): number {
  const minutes = durationSeconds / 60;

  // < 15 min: 4-6 sprites (use 6 for better preview)
  if (minutes < 15) {
    return 6;
  }

  // 30-60 min: 8-12 sprites (use 10)
  if (minutes < 60) {
    return 10;
  }

  // 2-3 hours: 15-25 sprites (use 20)
  if (minutes < 180) {
    return 20;
  }

  // Very long videos: cap at 25 sprites
  return 25;
}

/**
 * Calculate sprite interval (seconds between captures)
 */
export function getSpriteInterval(durationSeconds: number, spriteCount: number): number {
  return durationSeconds / spriteCount;
}

/**
 * Get sprite configuration for a video
 */
export interface SpriteConfig {
  count: number;
  interval: number; // seconds
  dimensions: {
    width: number;
    height: number;
  };
  layout: {
    cols: number;
    rows: number;
  };
}

export function getSpriteConfiguration(
  durationSeconds: number,
  videoWidth?: number,
  videoHeight?: number
): SpriteConfig {
  const count = getSpriteCount(durationSeconds);
  const interval = getSpriteInterval(durationSeconds, count);

  // Calculate grid layout (aim for roughly square grid)
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  // Standard thumbnail dimensions
  const thumbnailWidth = videoWidth && videoHeight 
    ? Math.min(160, videoWidth)
    : 160;
  
  const aspectRatio = videoWidth && videoHeight
    ? videoHeight / videoWidth
    : 9 / 16;

  const thumbnailHeight = Math.round(thumbnailWidth * aspectRatio);

  return {
    count,
    interval,
    dimensions: {
      width: thumbnailWidth,
      height: thumbnailHeight,
    },
    layout: {
      cols,
      rows,
    },
  };
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Get recommendation for video length
 */
export interface LengthRecommendation {
  tier: 'short' | 'medium' | 'long' | 'very_long';
  spriteCount: number;
  warning?: string;
}

export function getVideoLengthRecommendation(durationSeconds: number): LengthRecommendation {
  const minutes = durationSeconds / 60;
  const spriteCount = getSpriteCount(durationSeconds);

  if (minutes < 15) {
    return {
      tier: 'short',
      spriteCount,
    };
  }

  if (minutes < 60) {
    return {
      tier: 'medium',
      spriteCount,
    };
  }

  if (minutes < 180) {
    return {
      tier: 'long',
      spriteCount,
      warning: 'Long video - sprite generation may take several minutes',
    };
  }

  return {
    tier: 'very_long',
    spriteCount,
    warning: 'Very long video - generation will be slow and memory intensive',
  };
}
