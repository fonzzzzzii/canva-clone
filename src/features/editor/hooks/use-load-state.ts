import { fabric } from "fabric";
import { useEffect, useRef } from "react";

import { JSON_KEYS } from "@/features/editor/types";
import { ImageFrame, IFrame, isFrameType } from "@/features/editor/objects/image-frame";
import { FramedImage } from "@/features/editor/objects/framed-image";

interface UseLoadStateProps {
  autoZoom: () => void;
  zoomToPage?: (pageNumber: number) => void;
  canvas: fabric.Canvas | null;
  initialState: React.MutableRefObject<string | undefined>;
  canvasHistory: React.MutableRefObject<string[]>;
  setHistoryIndex: React.Dispatch<React.SetStateAction<number>>;
};

export const useLoadState = ({
  canvas,
  autoZoom,
  zoomToPage,
  initialState,
  canvasHistory,
  setHistoryIndex,
}: UseLoadStateProps) => {
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current && canvas) {
      // Case 1: No saved state - just zoom to page 1
      if (!initialState?.current) {
        initialized.current = true;
        // Small delay to ensure canvas is fully ready
        setTimeout(() => {
          if (zoomToPage) {
            zoomToPage(1);
          } else {
            autoZoom();
          }
        }, 0);
        return;
      }

      // Case 2: Has saved state - load it then zoom to page 1
      const data = JSON.parse(initialState.current);

      // Helper to find frame by ID, including inside groups (supports all frame types)
      const findFrameById = (frameId: string): IFrame | undefined => {
        // First check top-level objects
        for (const obj of canvas.getObjects()) {
          if (isFrameType(obj.type) && (obj as IFrame).id === frameId) {
            return obj as IFrame;
          }
          // Check inside groups
          if (obj.type === "group") {
            const group = obj as fabric.Group;
            const foundInGroup = group.getObjects().find(
              (o) => isFrameType(o.type) && (o as IFrame).id === frameId
            ) as IFrame | undefined;
            if (foundInGroup) return foundInGroup;
          }
        }
        return undefined;
      };

      // Helper to get absolute frame position and effective scale (accounting for group membership)
      const getAbsoluteFrameTransform = (frame: IFrame) => {
        const frameObj = frame as unknown as fabric.Object;
        if (frameObj.group) {
          const group = frameObj.group;
          const groupCenter = group.getCenterPoint();
          // Account for group scale when calculating position
          const relativeLeft = (frame.left || 0) * (group.scaleX || 1);
          const relativeTop = (frame.top || 0) * (group.scaleY || 1);
          // Effective scale = frame scale * group scale
          const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
          const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);
          return {
            left: groupCenter.x + relativeLeft,
            top: groupCenter.y + relativeTop,
            scaleX: effectiveScaleX,
            scaleY: effectiveScaleY,
          };
        }
        return {
          left: frame.left || 0,
          top: frame.top || 0,
          scaleX: frame.scaleX || 1,
          scaleY: frame.scaleY || 1,
        };
      };

      // Custom reviver to reapply clipPaths after loading
      const reviver = (obj: any, fabricObj: fabric.Object) => {
        if (fabricObj.type === "framedImage") {
          const framedImage = fabricObj as FramedImage;
          const linkedFrameId = framedImage.linkedFrameId;

          if (linkedFrameId) {
            // Find the linked frame and reapply clip after all objects are loaded
            setTimeout(() => {
              const frame = findFrameById(linkedFrameId);

              if (frame) {
                const frameObj = frame as unknown as fabric.Object;

                // Check if frame is inside a group
                if (frameObj.group) {
                  // Frame is in a group - need to use absolute position for clip
                  const transform = getAbsoluteFrameTransform(frame);

                  // Temporarily set frame to absolute position for correct clipPath
                  const savedLeft = frame.left;
                  const savedTop = frame.top;
                  const savedScaleX = frame.scaleX;
                  const savedScaleY = frame.scaleY;

                  (frame as any).set({
                    left: transform.left,
                    top: transform.top,
                    scaleX: transform.scaleX,
                    scaleY: transform.scaleY,
                  });

                  framedImage.applyFrameClip(frame);

                  // Restore original relative position
                  (frame as any).set({
                    left: savedLeft,
                    top: savedTop,
                    scaleX: savedScaleX,
                    scaleY: savedScaleY,
                  });
                } else {
                  // Frame is not in a group - use directly
                  framedImage.applyFrameClip(frame);
                }
                canvas.requestRenderAll();
              }
            }, 0);
          }
        }
      };

      canvas.loadFromJSON(data, () => {
        const currentState = JSON.stringify(
          canvas.toJSON(JSON_KEYS),
        );

        canvasHistory.current = [currentState];
        setHistoryIndex(0);
        // Zoom to page 1 on initial load (or autoZoom if zoomToPage not available)
        if (zoomToPage) {
          zoomToPage(1);
        } else {
          autoZoom();
        }
      }, reviver);
      initialized.current = true;
    }
  },
  [
    canvas,
    autoZoom,
    zoomToPage,
    initialState, // no need, this is a ref
    canvasHistory, // no need, this is a ref
    setHistoryIndex, // no need, this is a dispatch
  ]);
};
