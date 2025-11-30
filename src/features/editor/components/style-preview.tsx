import { AlbumStyle } from "@/features/editor/utils/auto-layout";

interface StylePreviewProps {
  style: AlbumStyle | "current";
  className?: string;
  size?: "sm" | "md";
}

export const StylePreview = ({ style, className, size = "md" }: StylePreviewProps) => {
  // Define size mappings
  const sizeMap = {
    sm: { width: "36px", height: "36px" },
    md: { width: "100px", height: "100px" },
  };

  const dimensions = sizeMap[size];

  // Define representative layouts for each style
  const layouts: Record<AlbumStyle | "current", { frames: Array<{ x: number; y: number; width: number; height: number }> }> = {
    current: {
      // Show a refresh/keep-current icon layout (single frame with arrows)
      frames: [
        { x: 15, y: 15, width: 70, height: 70 },
      ],
    },
    classic: {
      // Show double-vertical-half template (2 frames)
      frames: [
        { x: 5, y: 5, width: 43, height: 90 },
        { x: 52, y: 5, width: 43, height: 90 },
      ],
    },
    modern: {
      // Show double-left-large-right-small template
      frames: [
        { x: 5, y: 5, width: 60, height: 90 },
        { x: 70, y: 5, width: 25, height: 90 },
      ],
    },
    collage: {
      // Show quad-grid template (2x2)
      frames: [
        { x: 5, y: 5, width: 43, height: 43 },
        { x: 52, y: 5, width: 43, height: 43 },
        { x: 5, y: 52, width: 43, height: 43 },
        { x: 52, y: 52, width: 43, height: 43 },
      ],
    },
  };

  const layout = layouts[style];

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={dimensions}
    >
      {/* Background */}
      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        fill="#f3f4f6"
        stroke="#e5e7eb"
        strokeWidth="1"
      />

      {/* Frames */}
      {layout.frames.map((frame, idx) => (
        <rect
          key={idx}
          x={frame.x}
          y={frame.y}
          width={frame.width}
          height={frame.height}
          fill="white"
          stroke="#9ca3af"
          strokeWidth="1.5"
          strokeDasharray="3,2"
        />
      ))}
    </svg>
  );
};
