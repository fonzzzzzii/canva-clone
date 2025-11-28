import { fabric } from "fabric";
import { useCallback, useRef } from "react";
import { ImageFrame } from "@/features/editor/objects/image-frame";
import { FramedImage } from "@/features/editor/objects/framed-image";

interface UseClipboardProps {
  canvas: fabric.Canvas | null;
};

interface ClipboardData {
  frame?: any;
  image?: any;
  isFramePair?: boolean;
  group?: any;
  linkedImages?: any[];
  isGroupWithImages?: boolean;
}

export const useClipboard = ({
  canvas
}: UseClipboardProps) => {
  const clipboard = useRef<ClipboardData | any>(null);

  const copy = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const activeObject = canvas?.getActiveObject();
      if (!activeObject) {
        resolve();
        return;
      }

      // Check if copying a Group - need to also copy linked images for any ImageFrames inside
      if (activeObject.type === "group") {
        const group = activeObject as fabric.Group;
        const frames = group.getObjects().filter((obj) => obj.type === "imageFrame") as ImageFrame[];

        // Find all linked images for frames in this group
        const linkedImages: FramedImage[] = [];
        frames.forEach((frame) => {
          const linkedImage = frame.getLinkedImage(canvas!) as FramedImage | null;
          if (linkedImage) {
            linkedImages.push(linkedImage);
          }
        });

        if (linkedImages.length > 0) {
          // Clone the group
          group.clone((clonedGroup: any) => {
            // Clone all linked images
            let clonedImages: any[] = [];
            let cloneCount = 0;

            linkedImages.forEach((img, index) => {
              img.clone((clonedImage: any) => {
                clonedImages[index] = clonedImage;
                cloneCount++;

                // When all images are cloned, save to clipboard
                if (cloneCount === linkedImages.length) {
                  clipboard.current = {
                    group: clonedGroup,
                    linkedImages: clonedImages,
                    isGroupWithImages: true,
                  };
                  resolve();
                }
              });
            });
          });
          return;
        }

        // Group without ImageFrames - just clone normally
        group.clone((cloned: any) => {
          clipboard.current = cloned;
          resolve();
        });
        return;
      }

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
              resolve();
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
              resolve();
            });
          });
          return;
        }
      }

      // Default behavior for other objects
      activeObject.clone((cloned: any) => {
        clipboard.current = cloned;
        resolve();
      });
    });
  }, [canvas]);

  const paste = useCallback(() => {
    if (!clipboard.current || !canvas) return;

    // Handle group with linked images
    if (clipboard.current.isGroupWithImages) {
      const { group: storedGroup, linkedImages: storedImages } = clipboard.current;

      storedGroup.clone((clonedGroup: fabric.Group) => {
        // Clone all stored images
        let clonedImages: any[] = [];
        let cloneCount = 0;

        storedImages.forEach((img: any, index: number) => {
          img.clone((clonedImage: any) => {
            clonedImages[index] = clonedImage;
            cloneCount++;

            // When all images are cloned, proceed with paste
            if (cloneCount === storedImages.length) {
              const offsetX = 10;
              const offsetY = 10;

              // Get frames from the cloned group
              const clonedFrames = clonedGroup.getObjects().filter(
                (obj) => obj.type === "imageFrame"
              ) as ImageFrame[];

              // Generate new IDs and re-link frames with images
              // Match by index (frames and images were cloned in same order)
              clonedFrames.forEach((frame, idx) => {
                if (idx < clonedImages.length) {
                  const newFrameId = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${idx}`;
                  const newImageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${idx}`;

                  frame.id = newFrameId;
                  frame.linkedImageId = newImageId;
                  clonedImages[idx].id = newImageId;
                  clonedImages[idx].linkedFrameId = newFrameId;
                }
              });

              // Offset the group
              clonedGroup.set({
                left: (clonedGroup.left || 0) + offsetX,
                top: (clonedGroup.top || 0) + offsetY,
                evented: true,
                selectable: true,
              });

              // Calculate absolute positions for images based on group position
              const groupCenter = clonedGroup.getCenterPoint();

              clonedFrames.forEach((frame, idx) => {
                if (idx < clonedImages.length) {
                  const image = clonedImages[idx];

                  // Calculate absolute frame position
                  const relativeLeft = (frame.left || 0) * (clonedGroup.scaleX || 1);
                  const relativeTop = (frame.top || 0) * (clonedGroup.scaleY || 1);
                  const absoluteLeft = groupCenter.x + relativeLeft;
                  const absoluteTop = groupCenter.y + relativeTop;

                  // Effective scale
                  const effectiveScaleX = (frame.scaleX || 1) * (clonedGroup.scaleX || 1);
                  const effectiveScaleY = (frame.scaleY || 1) * (clonedGroup.scaleY || 1);

                  image.set({
                    left: absoluteLeft + image.offsetX,
                    top: absoluteTop + image.offsetY,
                    evented: false,
                    selectable: false,
                  });

                  // Apply clip with effective scale
                  const tempFrame = {
                    left: absoluteLeft,
                    top: absoluteTop,
                    width: frame.width,
                    height: frame.height,
                    scaleX: effectiveScaleX,
                    scaleY: effectiveScaleY,
                  } as ImageFrame;

                  image.applyFrameClip(tempFrame);
                }
              });

              // Add to canvas - images first (behind), then group
              canvas.discardActiveObject();
              clonedImages.forEach((img) => canvas.add(img));
              canvas.add(clonedGroup);

              // Update stored clipboard position for next paste
              storedGroup.left = (storedGroup.left || 0) + offsetX;
              storedGroup.top = (storedGroup.top || 0) + offsetY;
              storedImages.forEach((img: any) => {
                img.left = (img.left || 0) + offsetX;
                img.top = (img.top || 0) + offsetY;
              });

              // Select the group
              canvas.setActiveObject(clonedGroup);
              canvas.requestRenderAll();
            }
          });
        });
      });
      return;
    }

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
