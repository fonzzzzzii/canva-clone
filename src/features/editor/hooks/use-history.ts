import { fabric } from "fabric";
import { useCallback, useRef, useState } from "react";

import { JSON_KEYS } from "@/features/editor/types";
import { ImageFrame, IFrame, isFrameType } from "@/features/editor/objects/image-frame";
import { FramedImage } from "@/features/editor/objects/framed-image";

interface UseHistoryProps {
  canvas: fabric.Canvas | null;
  saveCallback?: (values: {
    json: string;
    height: number;
    width: number;
  }) => void;
};

export const useHistory = ({ canvas, saveCallback }: UseHistoryProps) => {
  const [historyIndex, setHistoryIndex] = useState(0);
  const canvasHistory = useRef<string[]>([]);
  const skipSave = useRef(false);

  // Helper to find frame by ID, including inside groups (supports all frame types)
  const findFrameById = useCallback((frameId: string): IFrame | undefined => {
    if (!canvas) return undefined;
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
  }, [canvas]);

  // Helper to get absolute frame position and effective scale (accounting for group membership)
  const getAbsoluteFrameTransform = useCallback((frame: IFrame) => {
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
  }, []);

  const canUndo = useCallback(() => {
    return historyIndex > 0;
  }, [historyIndex]);

  const canRedo = useCallback(() => {
    return historyIndex < canvasHistory.current.length - 1;
  }, [historyIndex]);

  const save = useCallback((skip = false) => {
    if (!canvas) return;

    const currentState = canvas.toJSON(JSON_KEYS);
    const json = JSON.stringify(currentState);

    if (!skip && !skipSave.current) {
      canvasHistory.current.push(json);
      setHistoryIndex(canvasHistory.current.length - 1);
    }

    const workspace = canvas
      .getObjects()
      .find((object) => object.name === "clip");
    const height = workspace?.height || 0;
    const width = workspace?.width || 0;

    saveCallback?.({ json, height, width });
  }, 
  [
    canvas,
    saveCallback,
  ]);

  const undo = useCallback(() => {
    if (canUndo()) {
      skipSave.current = true;
      canvas?.clear().renderAll();

      const previousIndex = historyIndex - 1;
      const previousState = JSON.parse(
        canvasHistory.current[previousIndex]
      );

      // Custom reviver for our custom object types
      const reviver = (obj: any, fabricObj: fabric.Object) => {
        // After all objects are loaded, reapply clipPaths to FramedImages
        if (fabricObj.type === "framedImage") {
          const framedImage = fabricObj as FramedImage;
          const linkedFrameId = framedImage.linkedFrameId;

          if (linkedFrameId && canvas) {
            // Find the linked frame and reapply clip
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

      canvas?.loadFromJSON(previousState, () => {
        canvas.renderAll();
        setHistoryIndex(previousIndex);
        skipSave.current = false;
      }, reviver);
    }
  }, [canUndo, canvas, historyIndex, findFrameById, getAbsoluteFrameTransform]);

  const redo = useCallback(() => {
    if (canRedo()) {
      skipSave.current = true;
      canvas?.clear().renderAll();

      const nextIndex = historyIndex + 1;
      const nextState = JSON.parse(
        canvasHistory.current[nextIndex]
      );

      // Custom reviver for our custom object types
      const reviver = (obj: any, fabricObj: fabric.Object) => {
        // After all objects are loaded, reapply clipPaths to FramedImages
        if (fabricObj.type === "framedImage") {
          const framedImage = fabricObj as FramedImage;
          const linkedFrameId = framedImage.linkedFrameId;

          if (linkedFrameId && canvas) {
            // Find the linked frame and reapply clip
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

      canvas?.loadFromJSON(nextState, () => {
        canvas.renderAll();
        setHistoryIndex(nextIndex);
        skipSave.current = false;
      }, reviver);
    }
  }, [canvas, historyIndex, canRedo, findFrameById, getAbsoluteFrameTransform]);

  return { 
    save,
    canUndo,
    canRedo,
    undo,
    redo,
    setHistoryIndex,
    canvasHistory,
  };
};
