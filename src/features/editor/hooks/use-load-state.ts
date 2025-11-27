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

      // Custom reviver to reapply clipPaths after loading
      const reviver = (obj: any, fabricObj: fabric.Object) => {
        if (fabricObj.type === "framedImage") {
          const framedImage = fabricObj as FramedImage;
          const linkedFrameId = framedImage.linkedFrameId;

          if (linkedFrameId) {
            // Find the linked frame and reapply clip after all objects are loaded
            setTimeout(() => {
              const frame = canvas.getObjects().find(
                (o) => o.type === "imageFrame" && (o as ImageFrame).id === linkedFrameId
              ) as ImageFrame | undefined;

              if (frame) {
                framedImage.applyFrameClip(frame);
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
