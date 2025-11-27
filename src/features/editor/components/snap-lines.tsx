import React from "react";
import type { SnapLine } from "@/features/editor/types";

interface SnapLinesProps {
  lines: SnapLine[];
  containerRef: React.RefObject<HTMLDivElement>;
}

export const SnapLines: React.FC<SnapLinesProps> = ({ lines, containerRef }) => {
  if (!containerRef.current) return null;

  const containerRect = containerRef.current.getBoundingClientRect();

  return (
    <div className="absolute inset-0 pointer-events-none z-50">
      {lines.map((line, index) => {
        if (line.orientation === "vertical" && line.x !== undefined) {
          return (
            <div
              key={`v-${index}-${line.x}`}
              className="absolute bg-pink-500 animate-in fade-in duration-150"
              style={{
                left: `${line.x}px`,
                top: 0,
                width: "1px",
                height: "100%",
              }}
            />
          );
        }

        if (line.orientation === "horizontal" && line.y !== undefined) {
          return (
            <div
              key={`h-${index}-${line.y}`}
              className="absolute bg-pink-500 animate-in fade-in duration-150"
              style={{
                top: `${line.y}px`,
                left: 0,
                height: "1px",
                width: "100%",
              }}
            />
          );
        }

        return null;
      })}
    </div>
  );
};
