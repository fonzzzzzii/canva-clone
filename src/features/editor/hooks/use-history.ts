import { fabric } from "fabric";
import { useCallback, useRef, useState } from "react";

import { JSON_KEYS } from "@/features/editor/types";
import { ImageFrame } from "@/features/editor/objects/image-frame";
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

  // Helper to find frame by ID, including inside groups
  const findFrameById = useCallback((frameId: string): ImageFrame | undefined => {
    if (!canvas) return undefined;
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
  }, [canvas]);

  // Helper to get absolute frame position (accounting for group membership)
  const getAbsoluteFramePosition = useCallback((frame: ImageFrame) => {
    if (frame.group) {
      const group = frame.group;
      const groupCenter = group.getCenterPoint();
      return {
        left: groupCenter.x + (frame.left || 0),
        top: groupCenter.y + (frame.top || 0),
      };
    }
    return {
      left: frame.left || 0,
      top: frame.top || 0,
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
                // Get absolute position (handles frames inside groups)
                const absolutePos = getAbsoluteFramePosition(frame);

                // Create a temp frame object with absolute coordinates for clipping
                const tempFrame = {
                  left: absolutePos.left,
                  top: absolutePos.top,
                  width: frame.width,
                  height: frame.height,
                  scaleX: frame.scaleX,
                  scaleY: frame.scaleY,
                } as ImageFrame;

                framedImage.applyFrameClip(tempFrame);
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
  }, [canUndo, canvas, historyIndex, findFrameById, getAbsoluteFramePosition]);

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
                // Get absolute position (handles frames inside groups)
                const absolutePos = getAbsoluteFramePosition(frame);

                // Create a temp frame object with absolute coordinates for clipping
                const tempFrame = {
                  left: absolutePos.left,
                  top: absolutePos.top,
                  width: frame.width,
                  height: frame.height,
                  scaleX: frame.scaleX,
                  scaleY: frame.scaleY,
                } as ImageFrame;

                framedImage.applyFrameClip(tempFrame);
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
  }, [canvas, historyIndex, canRedo, findFrameById, getAbsoluteFramePosition]);

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
