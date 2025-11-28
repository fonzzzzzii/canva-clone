import { useEffect, useRef } from "react";
import { fabric } from "fabric";
import {
  calculateGridSnap,
  findAlignmentLines,
  calculateCanvasSnap,
  roundRotationAngle,
} from "@/features/editor/utils";
import type { SnappingOptions, SnapLine } from "@/features/editor/types";

interface UseSnappingProps {
  canvas: fabric.Canvas | null;
  snappingOptions: SnappingOptions;
  onSnapLinesChange: (lines: SnapLine[]) => void;
  save: (skip?: boolean) => void;
  imageEditMode?: boolean;
}

export const useSnapping = ({
  canvas,
  snappingOptions,
  onSnapLinesChange,
  save,
  imageEditMode = false,
}: UseSnappingProps) => {
  // Track shift key state and initial drag position
  const shiftKeyRef = useRef(false);
  const dragStartRef = useRef<{ left: number; top: number } | null>(null);

  // Track snapped state to prevent jitter - "sticky" snapping
  // Key insight: Store the actual snapped position, not just snap line info
  // This lets us compare mouse position to stored position directly
  const snappedStateRef = useRef<{
    targetId: number | string | undefined;
    // Store the actual snapped left/top values
    snappedLeft: number | null;
    snappedTop: number | null;
    // Store snap line info for display
    xSnapLine: number | null;
    ySnapLine: number | null;
    // Store the source type for correct line styling
    xSnapSource: "canvas" | "object" | null;
    ySnapSource: "canvas" | "object" | null;
  } | null>(null);

  // Track shift key state globally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        shiftKeyRef.current = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        shiftKeyRef.current = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!canvas) return;

    const getWorkspaceForObject = (obj: fabric.Object) => {
      const workspaces = canvas
        .getObjects()
        .filter((object) => object.name === "clip" || object.name?.startsWith("clip-page-"));

      if (workspaces.length <= 1) {
        return workspaces[0];
      }

      // Get object's center point
      const objCenter = obj.getCenterPoint();

      // First, try to find workspace that contains the object's center
      for (const ws of workspaces) {
        const bounds = ws.getBoundingRect();
        if (
          objCenter.x >= bounds.left &&
          objCenter.x <= bounds.left + bounds.width &&
          objCenter.y >= bounds.top &&
          objCenter.y <= bounds.top + bounds.height
        ) {
          return ws;
        }
      }

      // If not inside any workspace, find the closest one
      let closestWorkspace = workspaces[0];
      let minDistance = Infinity;

      workspaces.forEach((ws) => {
        const wsCenter = ws.getCenterPoint();
        const distance = Math.sqrt(
          Math.pow(wsCenter.x - objCenter.x, 2) +
          Math.pow(wsCenter.y - objCenter.y, 2)
        );
        if (distance < minDistance) {
          minDistance = distance;
          closestWorkspace = ws;
        }
      });

      return closestWorkspace;
    };

    // Track when dragging starts to capture initial position
    const handleMouseDown = (e: fabric.IEvent) => {
      const target = e.target;
      if (target && target.name !== "clip" && !target.name?.startsWith("clip-page-")) {
        dragStartRef.current = {
          left: target.left || 0,
          top: target.top || 0,
        };
      }
    };

    const handleMouseUp = () => {
      dragStartRef.current = null;
      // Clear snapped state when mouse is released
      snappedStateRef.current = null;
    };

    const handleObjectMoving = (e: fabric.IEvent) => {
      const target = e.target;
      // Skip if target is a workspace
      if (!target || target.name === "clip" || target.name?.startsWith("clip-page-")) return;

      // Check if this is the content grabber (circle) being moved
      // Skip snapping for framedImage objects (they're handled by their linked frame)
      if (target.type === "framedImage") {
        return;
      }

      const workspace = getWorkspaceForObject(target);
      if (!workspace) return;

      const snapLines: SnapLine[] = [];
      // These start as the current mouse-driven position
      let snappedLeft = target.left || 0;
      let snappedTop = target.top || 0;
      let xSnapped = false;
      let ySnapped = false;

      // Shift-key constraint: move in straight line (horizontal or vertical only)
      if (shiftKeyRef.current && dragStartRef.current) {
        const deltaX = Math.abs(snappedLeft - dragStartRef.current.left);
        const deltaY = Math.abs(snappedTop - dragStartRef.current.top);

        // Determine if movement is more horizontal or vertical
        if (deltaX > deltaY) {
          // Constrain to horizontal movement
          snappedTop = dragStartRef.current.top;
          ySnapped = true;
          // Show horizontal constraint line
          const targetBounds = target.getBoundingRect();
          snapLines.push({
            y: targetBounds.top + targetBounds.height / 2,
            orientation: "horizontal",
            source: "canvas",
          });
        } else {
          // Constrain to vertical movement
          snappedLeft = dragStartRef.current.left;
          xSnapped = true;
          // Show vertical constraint line
          const targetBounds = target.getBoundingRect();
          snapLines.push({
            x: targetBounds.left + targetBounds.width / 2,
            orientation: "vertical",
            source: "canvas",
          });
        }

        // Apply constrained position
        target.set({
          left: snappedLeft,
          top: snappedTop,
        });

        onSnapLinesChange(snapLines);
        return;
      }

      // Track if we have any edge snapping (to disable grid snapping)
      let hasEdgeSnap = false;

      // "Break out" threshold - must move further to break out of a snap than to enter one
      const breakOutThreshold = snappingOptions.snapThreshold * 2;

      // CRITICAL: Check sticky state FIRST before any calculations
      // This prevents jitter by maintaining snapped position until user moves far enough
      const stickyState = snappedStateRef.current;
      const targetId = (target as any).id || target;
      const isSameTarget = stickyState?.targetId === targetId;

      if (isSameTarget && stickyState) {
        // Check X-axis sticky state
        if (stickyState.snappedLeft !== null && stickyState.xSnapLine !== null) {
          const deltaFromSnap = Math.abs((target.left || 0) - stickyState.snappedLeft);
          if (deltaFromSnap < breakOutThreshold) {
            // MAINTAIN the snapped position - don't let mouse move it
            snappedLeft = stickyState.snappedLeft;
            xSnapped = true;
            hasEdgeSnap = true;
            snapLines.push({ x: stickyState.xSnapLine, orientation: "vertical", source: stickyState.xSnapSource || "canvas" });
          } else {
            // User moved far enough - break out
            stickyState.snappedLeft = null;
            stickyState.xSnapLine = null;
          }
        }

        // Check Y-axis sticky state
        if (stickyState.snappedTop !== null && stickyState.ySnapLine !== null) {
          const deltaFromSnap = Math.abs((target.top || 0) - stickyState.snappedTop);
          if (deltaFromSnap < breakOutThreshold) {
            // MAINTAIN the snapped position
            snappedTop = stickyState.snappedTop;
            ySnapped = true;
            hasEdgeSnap = true;
            snapLines.push({ y: stickyState.ySnapLine, orientation: "horizontal", source: stickyState.ySnapSource || "canvas" });
          } else {
            // User moved far enough - break out
            stickyState.snappedTop = null;
            stickyState.ySnapLine = null;
          }
        }

        // If both axes broke out, clear the entire state
        if (stickyState.snappedLeft === null && stickyState.snappedTop === null) {
          snappedStateRef.current = null;
        }
      }

      // Priority 1: Snap to Canvas center/edges (highest priority)
      // Only check if not already sticky-snapped
      if (snappingOptions.snapToCanvas) {
        const targetCenter = target.getCenterPoint();
        const workspaceCenter = workspace.getCenterPoint();
        const workspaceBounds = workspace.getBoundingRect();

        // Check horizontal center (X-axis)
        if (!xSnapped) {
          const distanceToCenter = Math.abs(targetCenter.x - workspaceCenter.x);
          if (distanceToCenter < snappingOptions.snapThreshold) {
            const offset = workspaceCenter.x - targetCenter.x;
            snappedLeft = (target.left || 0) + offset;
            xSnapped = true;
            hasEdgeSnap = true;
            snapLines.push({ x: workspaceBounds.left + workspaceBounds.width / 2, orientation: "vertical", source: "canvas" });

            // Store snapped position
            if (!snappedStateRef.current) {
              snappedStateRef.current = {
                targetId,
                snappedLeft, snappedTop: null, xSnapLine: workspaceBounds.left + workspaceBounds.width / 2, ySnapLine: null,
                xSnapSource: "canvas", ySnapSource: null,
              };
            } else {
              snappedStateRef.current.snappedLeft = snappedLeft;
              snappedStateRef.current.xSnapLine = workspaceBounds.left + workspaceBounds.width / 2;
              snappedStateRef.current.xSnapSource = "canvas";
            }
          }
        }

        // Check vertical center (Y-axis)
        if (!ySnapped) {
          const distanceToCenter = Math.abs(targetCenter.y - workspaceCenter.y);
          if (distanceToCenter < snappingOptions.snapThreshold) {
            const offset = workspaceCenter.y - targetCenter.y;
            snappedTop = (target.top || 0) + offset;
            ySnapped = true;
            hasEdgeSnap = true;
            snapLines.push({ y: workspaceBounds.top + workspaceBounds.height / 2, orientation: "horizontal", source: "canvas" });

            // Store snapped position
            if (!snappedStateRef.current) {
              snappedStateRef.current = {
                targetId,
                snappedLeft: null, snappedTop, xSnapLine: null, ySnapLine: workspaceBounds.top + workspaceBounds.height / 2,
                xSnapSource: null, ySnapSource: "canvas",
              };
            } else {
              snappedStateRef.current.snappedTop = snappedTop;
              snappedStateRef.current.ySnapLine = workspaceBounds.top + workspaceBounds.height / 2;
              snappedStateRef.current.ySnapSource = "canvas";
            }
          }
        }

        // Check edges
        const targetBounds = target.getBoundingRect();

        // Left edge
        if (!xSnapped && Math.abs(targetBounds.left - workspaceBounds.left) < snappingOptions.snapThreshold) {
          const offset = workspaceBounds.left - targetBounds.left;
          snappedLeft = (target.left || 0) + offset;
          xSnapped = true;
          hasEdgeSnap = true;
          snapLines.push({ x: workspaceBounds.left, orientation: "vertical", source: "canvas" });

          if (!snappedStateRef.current) {
            snappedStateRef.current = { targetId, snappedLeft, snappedTop: null, xSnapLine: workspaceBounds.left, ySnapLine: null, xSnapSource: "canvas", ySnapSource: null };
          } else {
            snappedStateRef.current.snappedLeft = snappedLeft;
            snappedStateRef.current.xSnapLine = workspaceBounds.left;
            snappedStateRef.current.xSnapSource = "canvas";
          }
        }

        // Right edge
        if (!xSnapped && Math.abs((targetBounds.left + targetBounds.width) - (workspaceBounds.left + workspaceBounds.width)) < snappingOptions.snapThreshold) {
          const offset = (workspaceBounds.left + workspaceBounds.width) - (targetBounds.left + targetBounds.width);
          snappedLeft = (target.left || 0) + offset;
          xSnapped = true;
          hasEdgeSnap = true;
          const snapX = workspaceBounds.left + workspaceBounds.width;
          snapLines.push({ x: snapX, orientation: "vertical", source: "canvas" });

          if (!snappedStateRef.current) {
            snappedStateRef.current = { targetId, snappedLeft, snappedTop: null, xSnapLine: snapX, ySnapLine: null, xSnapSource: "canvas", ySnapSource: null };
          } else {
            snappedStateRef.current.snappedLeft = snappedLeft;
            snappedStateRef.current.xSnapLine = snapX;
            snappedStateRef.current.xSnapSource = "canvas";
          }
        }

        // Top edge
        if (!ySnapped && Math.abs(targetBounds.top - workspaceBounds.top) < snappingOptions.snapThreshold) {
          const offset = workspaceBounds.top - targetBounds.top;
          snappedTop = (target.top || 0) + offset;
          ySnapped = true;
          hasEdgeSnap = true;
          snapLines.push({ y: workspaceBounds.top, orientation: "horizontal", source: "canvas" });

          if (!snappedStateRef.current) {
            snappedStateRef.current = { targetId, snappedLeft: null, snappedTop, xSnapLine: null, ySnapLine: workspaceBounds.top, xSnapSource: null, ySnapSource: "canvas" };
          } else {
            snappedStateRef.current.snappedTop = snappedTop;
            snappedStateRef.current.ySnapLine = workspaceBounds.top;
            snappedStateRef.current.ySnapSource = "canvas";
          }
        }

        // Bottom edge
        if (!ySnapped && Math.abs((targetBounds.top + targetBounds.height) - (workspaceBounds.top + workspaceBounds.height)) < snappingOptions.snapThreshold) {
          const offset = (workspaceBounds.top + workspaceBounds.height) - (targetBounds.top + targetBounds.height);
          snappedTop = (target.top || 0) + offset;
          ySnapped = true;
          hasEdgeSnap = true;
          const snapY = workspaceBounds.top + workspaceBounds.height;
          snapLines.push({ y: snapY, orientation: "horizontal", source: "canvas" });

          if (!snappedStateRef.current) {
            snappedStateRef.current = { targetId, snappedLeft: null, snappedTop, xSnapLine: null, ySnapLine: snapY, xSnapSource: null, ySnapSource: "canvas" };
          } else {
            snappedStateRef.current.snappedTop = snappedTop;
            snappedStateRef.current.ySnapLine = snapY;
            snappedStateRef.current.ySnapSource = "canvas";
          }
        }
      }

      // Priority 2: Snap to Objects - check X and Y independently for corner snapping
      // Only recalculate if not already sticky-snapped on that axis
      if (snappingOptions.snapToObjects) {
        const targetBounds = target.getBoundingRect();
        const targetWidth = targetBounds.width;
        const targetHeight = targetBounds.height;

        const targetLeft = targetBounds.left;
        const targetRight = targetBounds.left + targetWidth;
        const targetTop = targetBounds.top;
        const targetBottom = targetBounds.top + targetHeight;
        const targetCenterX = targetBounds.left + targetWidth / 2;
        const targetCenterY = targetBounds.top + targetHeight / 2;

        // Collect all potential snap points
        const verticalSnapPoints: Array<{
          distance: number;
          snapX: number;
          offset: number;
        }> = [];
        const horizontalSnapPoints: Array<{
          distance: number;
          snapY: number;
          offset: number;
        }> = [];

        // Check against all other objects
        canvas.getObjects().forEach((obj) => {
          if (obj === target || obj.name === "clip" || obj.name?.startsWith("clip-page-")) return;
          if (obj.type === "framedImage") return; // Skip framed images

          const objBounds = obj.getBoundingRect();
          const objLeft = objBounds.left;
          const objRight = objBounds.left + objBounds.width;
          const objTop = objBounds.top;
          const objBottom = objBounds.top + objBounds.height;
          const objCenterX = objBounds.left + objBounds.width / 2;
          const objCenterY = objBounds.top + objBounds.height / 2;

          // Vertical snapping (X-axis) - only collect if not already snapped
          if (!xSnapped) {
            verticalSnapPoints.push(
              { distance: Math.abs(targetLeft - objLeft), snapX: objLeft, offset: objLeft - targetLeft },
              { distance: Math.abs(targetRight - objRight), snapX: objRight, offset: objRight - targetRight },
              { distance: Math.abs(targetLeft - objRight), snapX: objRight, offset: objRight - targetLeft },
              { distance: Math.abs(targetRight - objLeft), snapX: objLeft, offset: objLeft - targetRight },
              { distance: Math.abs(targetCenterX - objCenterX), snapX: objCenterX, offset: objCenterX - targetCenterX }
            );
          }

          // Horizontal snapping (Y-axis) - only collect if not already snapped
          if (!ySnapped) {
            horizontalSnapPoints.push(
              { distance: Math.abs(targetTop - objTop), snapY: objTop, offset: objTop - targetTop },
              { distance: Math.abs(targetBottom - objBottom), snapY: objBottom, offset: objBottom - targetBottom },
              { distance: Math.abs(targetTop - objBottom), snapY: objBottom, offset: objBottom - targetTop },
              { distance: Math.abs(targetBottom - objTop), snapY: objTop, offset: objTop - targetBottom },
              { distance: Math.abs(targetCenterY - objCenterY), snapY: objCenterY, offset: objCenterY - targetCenterY }
            );
          }
        });

        // Find and apply closest vertical snap (if not already snapped)
        if (verticalSnapPoints.length > 0 && !xSnapped) {
          const withinThreshold = verticalSnapPoints.filter(
            (p) => p.distance < snappingOptions.snapThreshold
          );
          if (withinThreshold.length > 0) {
            const closest = withinThreshold.reduce((prev, curr) =>
              curr.distance < prev.distance ? curr : prev
            );
            // Apply the exact offset to make edges flush
            snappedLeft = (target.left || 0) + closest.offset;
            xSnapped = true;
            hasEdgeSnap = true;
            snapLines.push({ x: closest.snapX, orientation: "vertical", source: "object" });

            // Store the snapped position for sticky state
            if (!snappedStateRef.current) {
              snappedStateRef.current = {
                targetId,
                snappedLeft: snappedLeft,
                snappedTop: null,
                xSnapLine: closest.snapX,
                ySnapLine: null,
                xSnapSource: "object",
                ySnapSource: null,
              };
            } else {
              snappedStateRef.current.snappedLeft = snappedLeft;
              snappedStateRef.current.xSnapLine = closest.snapX;
              snappedStateRef.current.xSnapSource = "object";
            }
          }
        }

        // Find and apply closest horizontal snap (if not already snapped)
        if (horizontalSnapPoints.length > 0 && !ySnapped) {
          const withinThreshold = horizontalSnapPoints.filter(
            (p) => p.distance < snappingOptions.snapThreshold
          );
          if (withinThreshold.length > 0) {
            const closest = withinThreshold.reduce((prev, curr) =>
              curr.distance < prev.distance ? curr : prev
            );
            // Apply the exact offset to make edges flush
            snappedTop = (target.top || 0) + closest.offset;
            ySnapped = true;
            hasEdgeSnap = true;
            snapLines.push({ y: closest.snapY, orientation: "horizontal", source: "object" });

            // Store the snapped position for sticky state
            if (!snappedStateRef.current) {
              snappedStateRef.current = {
                targetId,
                snappedLeft: null,
                snappedTop: snappedTop,
                xSnapLine: null,
                ySnapLine: closest.snapY,
                xSnapSource: null,
                ySnapSource: "object",
              };
            } else {
              snappedStateRef.current.snappedTop = snappedTop;
              snappedStateRef.current.ySnapLine = closest.snapY;
              snappedStateRef.current.ySnapSource = "object";
            }
          }
        }
      }

      // Priority 3: Snap to Grid (lowest priority) - DISABLED when edge snapping is active
      if (snappingOptions.snapToGrid && !hasEdgeSnap) {
        // Calculate position relative to workspace origin
        const relativeLeft = (target.left || 0) - (workspace.left || 0);
        const relativeTop = (target.top || 0) - (workspace.top || 0);

        // Snap to grid in workspace coordinate space
        const gridSnap = calculateGridSnap(
          { left: relativeLeft, top: relativeTop },
          snappingOptions.snapGridSize
        );

        // Convert back to canvas coordinates
        if (!xSnapped) {
          snappedLeft = (workspace.left || 0) + gridSnap.left;
        }
        if (!ySnapped) {
          snappedTop = (workspace.top || 0) + gridSnap.top;
        }
      }

      // Apply snapped position
      target.set({
        left: snappedLeft,
        top: snappedTop,
      });

      // Update snap lines
      onSnapLinesChange(snapLines);
    };

    const handleObjectScaling = (e: fabric.IEvent) => {
      const target = e.target;
      if (!target || target.name === "clip") return;

      // Clear snap lines during scaling for smooth interaction
      onSnapLinesChange([]);

      // Skip snapping for framedImage objects
      if (target.type === "framedImage") {
        return;
      }

      // Normal scaling behavior for non-FramedImage or when not in edit mode
      // Apply scaling snap while dragging if snap to grid is enabled
      if (snappingOptions.snapToGrid) {
        const currentWidth = target.getScaledWidth();
        const currentHeight = target.getScaledHeight();

        const snappedWidth = Math.round(currentWidth / snappingOptions.snapGridSize) * snappingOptions.snapGridSize;
        const snappedHeight = Math.round(currentHeight / snappingOptions.snapGridSize) * snappingOptions.snapGridSize;

        const widthDiff = Math.abs(currentWidth - snappedWidth);
        const heightDiff = Math.abs(currentHeight - snappedHeight);

        // Determine origin based on which corner is being dragged
        // @ts-ignore - __corner exists during scaling
        const corner = target.__corner;

        let originX: 'left' | 'center' | 'right' = 'left';
        let originY: 'top' | 'center' | 'bottom' = 'top';

        // Map corner to the opposite origin point (the point that should stay fixed)
        if (corner) {
          if (corner.includes('l')) {
            originX = 'right'; // Left handle - fix right edge
          } else if (corner.includes('r')) {
            originX = 'left'; // Right handle - fix left edge
          } else {
            originX = 'center'; // Middle handles
          }

          if (corner.includes('t')) {
            originY = 'bottom'; // Top handle - fix bottom edge
          } else if (corner.includes('b')) {
            originY = 'top'; // Bottom handle - fix top edge
          } else {
            originY = 'center'; // Middle handles
          }
        }

        // Get the position of the origin point before scaling
        const originPoint = target.getPointByOrigin(originX, originY);

        // Apply scale adjustments only if within threshold
        if (widthDiff < snappingOptions.snapThreshold) {
          const scaleAdjustmentX = snappedWidth / currentWidth;
          target.scaleX = (target.scaleX || 1) * scaleAdjustmentX;
        }

        if (heightDiff < snappingOptions.snapThreshold) {
          const scaleAdjustmentY = snappedHeight / currentHeight;
          target.scaleY = (target.scaleY || 1) * scaleAdjustmentY;
        }

        // Restore the origin point position to prevent sliding
        target.setPositionByOrigin(originPoint, originX, originY);
        target.setCoords();
      }
    };

    const handleObjectRotating = (e: fabric.IEvent) => {
      const target = e.target;
      if (!target || target.name === "clip") return;

      if (snappingOptions.snapRotation) {
        const currentAngle = target.angle || 0;
        const snappedAngle = roundRotationAngle(currentAngle);

        if (Math.abs(currentAngle - snappedAngle) < 3) {
          target.set({ angle: snappedAngle });
        }
      }

      // Clear snap lines during rotation
      onSnapLinesChange([]);
    };

    const handleObjectModified = (e: fabric.IEvent) => {
      // Clear snap lines when object modification is complete
      onSnapLinesChange([]);

      // Save canvas state
      save();
    };

    const handleSelectionCleared = () => {
      // Clear snap lines when selection is cleared
      onSnapLinesChange([]);
    };

    // Add event listeners
    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:up", handleMouseUp);
    canvas.on("object:moving", handleObjectMoving);
    canvas.on("object:scaling", handleObjectScaling);
    canvas.on("object:rotating", handleObjectRotating);
    canvas.on("object:modified", handleObjectModified);
    canvas.on("selection:cleared", handleSelectionCleared);

    // Cleanup
    return () => {
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:up", handleMouseUp);
      canvas.off("object:moving", handleObjectMoving);
      canvas.off("object:scaling", handleObjectScaling);
      canvas.off("object:rotating", handleObjectRotating);
      canvas.off("object:modified", handleObjectModified);
      canvas.off("selection:cleared", handleSelectionCleared);
    };
  }, [canvas, snappingOptions, onSnapLinesChange, save, imageEditMode]);
};
