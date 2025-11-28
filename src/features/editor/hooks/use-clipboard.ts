import { fabric } from "fabric";
import { useCallback, useRef } from "react";
import { ImageFrame } from "@/features/editor/objects/image-frame";
import { FramedImage } from "@/features/editor/objects/framed-image";

interface UseClipboardProps {
  canvas: fabric.Canvas | null;
};

interface ClipboardData {
  frame: any;
  image: any;
  isFramePair: boolean;
}

export const useClipboard = ({
  canvas
}: UseClipboardProps) => {
  const clipboard = useRef<ClipboardData | any>(null);

  const copy = useCallback(() => {
    const activeObject = canvas?.getActiveObject();
    if (!activeObject) return;

    // Check if copying an ImageFrame - need to also copy linked image
    if (activeObject.type === "imageFrame") {
      const frame = activeObject as ImageFrame;
      const linkedImage = frame.getLinkedImage(canvas!) as FramedImage | null;

      if (linkedImage) {
        // Clone both frame and image
        frame.clone((clonedFrame: any) => {
          linkedImage.clone((clonedImage: any) => {
            clipboard.current = {
              frame: clonedFrame,
              image: clonedImage,
              isFramePair: true,
            };
          });
        });
        return;
      }
    }

    // Check if copying a FramedImage - need to also copy linked frame
    if (activeObject.type === "framedImage") {
      const image = activeObject as FramedImage;
      const linkedFrame = image.getLinkedFrame(canvas!);

      if (linkedFrame) {
        // Clone both frame and image
        linkedFrame.clone((clonedFrame: any) => {
          image.clone((clonedImage: any) => {
            clipboard.current = {
              frame: clonedFrame,
              image: clonedImage,
              isFramePair: true,
            };
          });
        });
        return;
      }
    }

    // Default behavior for other objects
    activeObject.clone((cloned: any) => {
      clipboard.current = cloned;
    });
  }, [canvas]);

  const paste = useCallback(() => {
    if (!clipboard.current || !canvas) return;

    // Handle frame+image pair
    if (clipboard.current.isFramePair) {
      const { frame: storedFrame, image: storedImage } = clipboard.current;

      storedFrame.clone((clonedFrame: any) => {
        storedImage.clone((clonedImage: any) => {
          // Generate new IDs for the cloned pair
          const newFrameId = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const newImageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          // Update IDs and links
          clonedFrame.id = newFrameId;
          clonedFrame.linkedImageId = newImageId;
          clonedImage.id = newImageId;
          clonedImage.linkedFrameId = newFrameId;

          // Offset the pasted objects
          const offsetX = 10;
          const offsetY = 10;

          clonedFrame.set({
            left: clonedFrame.left + offsetX,
            top: clonedFrame.top + offsetY,
            evented: true,
            selectable: true,
          });

          clonedImage.set({
            left: clonedImage.left + offsetX,
            top: clonedImage.top + offsetY,
            evented: false,
            selectable: false,
          });

          // Reapply clip path for the new position
          clonedImage.applyFrameClip(clonedFrame);

          // Add to canvas - image first (behind), then frame
          canvas.discardActiveObject();
          canvas.add(clonedImage);
          canvas.add(clonedFrame);

          // Update stored clipboard position for next paste
          storedFrame.left += offsetX;
          storedFrame.top += offsetY;
          storedImage.left += offsetX;
          storedImage.top += offsetY;

          // Select the frame
          canvas.setActiveObject(clonedFrame);
          canvas.requestRenderAll();
        });
      });
      return;
    }

    // Default behavior for other objects
    clipboard.current.clone((clonedObj: any) => {
      canvas.discardActiveObject();
      clonedObj.set({
        left: clonedObj.left + 10,
        top: clonedObj.top + 10,
        evented: true,
      });

      if (clonedObj.type === "activeSelection") {
        clonedObj.canvas = canvas;
        clonedObj.forEachObject((obj: any) => {
          canvas.add(obj);
        });
        clonedObj.setCoords();
      } else {
        canvas.add(clonedObj);
      }

      clipboard.current.top += 10;
      clipboard.current.left += 10;
      canvas.setActiveObject(clonedObj);
      canvas.requestRenderAll();
    });
  }, [canvas]);

  const hasClipboard = useCallback(() => {
    return clipboard.current !== null;
  }, []);

  return { copy, paste, hasClipboard };
};
