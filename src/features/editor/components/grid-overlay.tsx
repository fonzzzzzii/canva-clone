import React from "react";

interface GridOverlayProps {
  show: boolean;
  visualGridSize: number;
  containerWidth: number;
  containerHeight: number;
  workspaceLeft: number;
  workspaceTop: number;
  workspaceWidth: number;
  workspaceHeight: number;
}

export const GridOverlay: React.FC<GridOverlayProps> = ({
  show,
  visualGridSize,
  containerWidth,
  containerHeight,
  workspaceLeft,
  workspaceTop,
  workspaceWidth,
  workspaceHeight,
}) => {
  if (!show) return null;

  const dots: JSX.Element[] = [];

  // Start from workspace origin (0, 0 in object space)
  // and draw dots at visualGridSize intervals
  for (let x = 0; x <= workspaceWidth; x += visualGridSize) {
    for (let y = 0; y <= workspaceHeight; y += visualGridSize) {
      // Position dots in object space (workspace coordinates)
      dots.push(
        <circle
          key={`${x}-${y}`}
          cx={workspaceLeft + x}
          cy={workspaceTop + y}
          r="1.5"
          fill="#94a3b8"
          opacity="0.4"
        />
      );
    }
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <svg
        width={containerWidth}
        height={containerHeight}
        className="w-full h-full"
      >
        {dots}
      </svg>
    </div>
  );
};
