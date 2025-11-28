import React from "react";
import type { SnapLine } from "@/features/editor/types";

interface SnapLinesProps {
  lines: SnapLine[];
  containerRef: React.RefObject<HTMLDivElement>;
}

export const SnapLines: React.FC<SnapLinesProps> = ({ lines, containerRef }) => {
  if (!containerRef.current) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-50">
      {lines.map((line, index) => {
        const isObjectSnap = line.source === "object";

        // Canvas/page snapping: solid pink line
        // Object snapping: dashed cyan line
        const baseStyle = isObjectSnap
          ? {
              background: "repeating-linear-gradient(to bottom, #06b6d4 0, #06b6d4 4px, transparent 4px, transparent 8px)",
            }
          : {
              backgroundColor: "#ec4899", // pink-500
            };

        if (line.orientation === "vertical" && line.x !== undefined) {
          return (
            <div
              key={`v-${index}-${line.x}`}
              className="absolute animate-in fade-in duration-150"
              style={{
                left: `${line.x}px`,
                top: 0,
                width: "1px",
                height: "100%",
                ...(isObjectSnap
                  ? { background: "repeating-linear-gradient(to bottom, #06b6d4 0, #06b6d4 4px, transparent 4px, transparent 8px)" }
                  : { backgroundColor: "#ec4899" }),
              }}
            />
          );
        }

        if (line.orientation === "horizontal" && line.y !== undefined) {
          return (
            <div
              key={`h-${index}-${line.y}`}
              className="absolute animate-in fade-in duration-150"
              style={{
                top: `${line.y}px`,
                left: 0,
                height: "1px",
                width: "100%",
                ...(isObjectSnap
                  ? { background: "repeating-linear-gradient(to right, #06b6d4 0, #06b6d4 4px, transparent 4px, transparent 8px)" }
                  : { backgroundColor: "#ec4899" }),
              }}
            />
          );
        }

        return null;
      })}
    </div>
  );
};
