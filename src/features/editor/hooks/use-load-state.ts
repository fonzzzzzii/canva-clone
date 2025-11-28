import { fabric } from "fabric";
import { useEffect, useRef } from "react";

import { JSON_KEYS } from "@/features/editor/types";
import { ImageFrame } from "@/features/editor/objects/image-frame";
import { FramedImage } from "@/features/editor/objects/framed-image";

interface UseLoadStateProps {
  autoZoom: () => void;
  canvas: fabric.Canvas | null;
  initialState: React.MutableRefObject<string | undefined>;
  canvasHistory: React.MutableRefObject<string[]>;
  setHistoryIndex: React.Dispatch<React.SetStateAction<number>>;
};

export const useLoadState = ({
  canvas,
  autoZoom,
  initialState,
  canvasHistory,
  setHistoryIndex,
}: UseLoadStateProps) => {
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current && initialState?.current && canvas) {
      const data = JSON.parse(initialState.current);

      // Helper to find frame by ID, including inside groups
      const findFrameById = (frameId: string): ImageFrame | undefined => {
        // First check top-level objects
        for (const obj of canvas.getObjects()) {
          if (obj.type === "imageFrame" && (obj as ImageFrame).id === frameId) {
            return obj as ImageFrame;
          }
          // Check inside groups
          if (obj.type === "group") {
            const group = obj as fabric.Group;
            const foundInGroup = group.getObjects().find(
              (o) => o.type === "imageFrame" && (o as ImageFrame).id === frameId
            ) as ImageFrame | undefined;
            if (foundInGroup) return foundInGroup;
          }
        }
        return undefined;
      };

      // Helper to get absolute frame position and effective scale (accounting for group membership)
      const getAbsoluteFrameTransform = (frame: ImageFrame) => {
        if (frame.group) {
          const group = frame.group;
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
                // Get absolute position and effective scale (handles frames inside groups)
                const transform = getAbsoluteFrameTransform(frame);

                // Create a temp frame object with absolute coordinates for clipping
                const tempFrame = {
                  left: transform.left,
                  top: transform.top,
                  width: frame.width,
                  height: frame.height,
                  scaleX: transform.scaleX,
                  scaleY: transform.scaleY,
                } as ImageFrame;

                framedImage.applyFrameClip(tempFrame);
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
        autoZoom();
      }, reviver);
      initialized.current = true;
    }
  },
  [
    canvas,
    autoZoom,
    initialState, // no need, this is a ref
    canvasHistory, // no need, this is a ref
    setHistoryIndex, // no need, this is a dispatch
  ]);
};
