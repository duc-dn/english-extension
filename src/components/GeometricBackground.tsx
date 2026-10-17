import React from 'react';

interface GeometricBackgroundProps {
  isDark?: boolean;
  style?: React.CSSProperties;
  className?: string;
  variant?: 'full' | 'card' | 'compact';
}

export const GeometricBackground: React.FC<GeometricBackgroundProps> = ({
  isDark = false,
  style,
  className = '',
  variant = 'full',
}) => {
  // Theme color tokens
  const gridColor = isDark ? 'rgba(56, 189, 248, 0.05)' : 'rgba(2, 132, 199, 0.06)';
  const nodeColor = isDark ? '#38bdf8' : '#0284c7';
  const strokePrimary = isDark ? 'rgba(56, 189, 248, 0.22)' : 'rgba(2, 132, 199, 0.2)';
  const strokeSecondary = isDark ? 'rgba(14, 165, 233, 0.16)' : 'rgba(14, 165, 233, 0.14)';
  const glowStart = isDark ? 'rgba(14, 165, 233, 0.12)' : 'rgba(14, 165, 233, 0.09)';
  const facetFill1 = isDark ? 'rgba(14, 165, 233, 0.06)' : 'rgba(2, 132, 199, 0.04)';
  const facetFill2 = isDark ? 'rgba(56, 189, 248, 0.09)' : 'rgba(14, 165, 233, 0.06)';
  const facetFill3 = isDark ? 'rgba(99, 102, 241, 0.07)' : 'rgba(56, 189, 248, 0.03)';

  const gridId = `geom-grid-${variant}-${isDark ? 'dark' : 'light'}`;
  const glowId = `geom-glow-${variant}-${isDark ? 'dark' : 'light'}`;
  const facetGrad1 = `facet-grad-1-${variant}-${isDark ? 'dark' : 'light'}`;
  const facetGrad2 = `facet-grad-2-${variant}-${isDark ? 'dark' : 'light'}`;

  if (variant === 'compact') {
    return (
      <div
        className={`geometric-bg-compact ${className}`}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: 0,
          ...style,
        }}
        aria-hidden="true"
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 500 800"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id={gridId} width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M 28 0 L 0 0 0 28" fill="none" stroke={gridColor} strokeWidth="0.8" />
            </pattern>
            <radialGradient id={glowId} cx="30%" cy="20%" r="60%">
              <stop offset="0%" stopColor={glowStart} />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <linearGradient id={facetGrad1} x1="100%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor={facetFill2} />
              <stop offset="100%" stopColor={facetFill1} />
            </linearGradient>
          </defs>

          {/* Ambient Glow */}
          <rect width="100%" height="100%" fill={`url(#${glowId})`} />

          {/* Coordinate Grid */}
          <rect width="100%" height="100%" fill={`url(#${gridId})`} />

          {/* Angled geometric polygons at bottom right */}
          <polygon
            points="180,800 240,640 500,480 500,800"
            fill={`url(#${facetGrad1})`}
            stroke={strokePrimary}
            strokeWidth="1"
          />
          <polygon
            points="240,640 500,480 500,560 320,700"
            fill={facetFill3}
            stroke={strokeSecondary}
            strokeWidth="0.8"
          />

          {/* Minimal coordinate nodes */}
          <circle cx="240" cy="640" r="2.5" fill={nodeColor} opacity="0.6" />
          <circle cx="500" cy="480" r="2.5" fill={nodeColor} opacity="0.6" />
        </svg>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={`geometric-bg-card ${className}`}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: 0,
          borderRadius: 'inherit',
          ...style,
        }}
        aria-hidden="true"
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 800 300"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id={gridId} width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke={gridColor} strokeWidth="0.9" />
              <circle cx="32" cy="0" r="0.8" fill={gridColor} />
            </pattern>
            <radialGradient id={glowId} cx="15%" cy="30%" r="70%">
              <stop offset="0%" stopColor={glowStart} />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <linearGradient id={facetGrad1} x1="100%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor={facetFill2} />
              <stop offset="100%" stopColor={facetFill1} />
            </linearGradient>
            <linearGradient id={facetGrad2} x1="80%" y1="0%" x2="20%" y2="100%">
              <stop offset="0%" stopColor={facetFill3} />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>

          {/* Ambient Lighting */}
          <rect width="100%" height="100%" fill={`url(#${glowId})`} />

          {/* Blueprint Grid */}
          <rect width="100%" height="100%" fill={`url(#${gridId})`} />

          {/* Angled Facet Ribbon across bottom-right */}
          <polygon
            points="380,300 460,180 800,80 800,300"
            fill={`url(#${facetGrad1})`}
            stroke={strokePrimary}
            strokeWidth="1.2"
          />
          <polygon
            points="460,180 800,80 800,160 540,240"
            fill={`url(#${facetGrad2})`}
            stroke={strokeSecondary}
            strokeWidth="1"
          />

          {/* Intersection Points */}
          <circle cx="460" cy="180" r="3" fill={nodeColor} opacity="0.75" />
          <circle cx="800" cy="80" r="3" fill={nodeColor} opacity="0.75" />
          <line x1="460" y1="180" x2="380" y2="300" stroke={strokePrimary} strokeWidth="1" strokeDasharray="3 3" />
        </svg>
      </div>
    );
  }

  // Default 'full' variant - Matches the exact blueprint & angled facets in the VNPT AI reference slide
  return (
    <div
      className={`geometric-bg-full ${className}`}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 0,
        ...style,
      }}
      aria-hidden="true"
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Technical Coordinate Blueprint Grid */}
          <pattern id={gridId} width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M 36 0 L 0 0 0 36" fill="none" stroke={gridColor} strokeWidth="0.85" />
            {/* Fine coordinate crosshair in corner */}
            <circle cx="36" cy="0" r="0.9" fill={gridColor} opacity="0.8" />
          </pattern>

          {/* Ambient Lighting Gradient */}
          <radialGradient id={glowId} cx="15%" cy="15%" r="65%">
            <stop offset="0%" stopColor={glowStart} />
            <stop offset="60%" stopColor="transparent" />
          </radialGradient>

          {/* Facet Fill Gradient 1 */}
          <linearGradient id={facetGrad1} x1="100%" y1="100%" x2="20%" y2="10%">
            <stop offset="0%" stopColor={facetFill2} />
            <stop offset="65%" stopColor={facetFill1} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>

          {/* Facet Fill Gradient 2 */}
          <linearGradient id={facetGrad2} x1="70%" y1="20%" x2="0%" y2="80%">
            <stop offset="0%" stopColor={facetFill3} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {/* Ambient illumination */}
        <rect width="100%" height="100%" fill={`url(#${glowId})`} />

        {/* Technical Coordinate Grid */}
        <rect width="100%" height="100%" fill={`url(#${gridId})`} />

        {/* Main Angled Polygon Plane (Sweeping from bottom-right towards mid-left as in reference slide) */}
        <polygon
          points="620,900 780,680 1260,420 1440,510 1440,900"
          fill={`url(#${facetGrad1})`}
          stroke={strokePrimary}
          strokeWidth="1.2"
        />

        {/* Overlapping Secondary Geometric Ribbon */}
        <polygon
          points="780,680 1260,420 1440,480 1440,390 1280,340 840,590"
          fill={`url(#${facetGrad2})`}
          stroke={strokeSecondary}
          strokeWidth="1"
        />

        {/* Tertiary Upper Corner Geometric Plane */}
        <polygon
          points="1080,180 1440,60 1440,240 1240,310"
          fill={facetFill1}
          stroke={strokeSecondary}
          strokeWidth="0.8"
          strokeDasharray="4 4"
        />

        {/* Accent structural lines extending to edges */}
        <line x1="780" y1="680" x2="620" y2="900" stroke={strokePrimary} strokeWidth="1.2" />
        <line x1="780" y1="680" x2="1260" y2="420" stroke={strokePrimary} strokeWidth="1.2" />
        <line x1="1260" y1="420" x2="1440" y2="510" stroke={strokePrimary} strokeWidth="1" />
        <line x1="840" y1="590" x2="480" y2="760" stroke={strokeSecondary} strokeWidth="0.9" strokeDasharray="5 5" />

        {/* Geometric Coordinate Nodes / Points */}
        <circle cx="780" cy="680" r="3.5" fill={nodeColor} opacity="0.8" />
        <circle cx="1260" cy="420" r="3" fill={nodeColor} opacity="0.8" />
        <circle cx="840" cy="590" r="2.5" fill={nodeColor} opacity="0.6" />
        <circle cx="1280" cy="340" r="2.5" fill={nodeColor} opacity="0.6" />

        {/* Fine crosshairs (+) at blueprint coordinate intersections */}
        <g stroke={nodeColor} strokeWidth="0.9" opacity="0.35">
          <path d="M 360,180 L 360,192 M 354,186 L 366,186" />
          <path d="M 1080,144 L 1080,156 M 1074,150 L 1086,150" />
          <path d="M 504,504 L 504,516 M 498,510 L 510,510" />
        </g>
      </svg>
    </div>
  );
};
