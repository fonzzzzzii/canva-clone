import { PageTemplate, FramePosition } from "../types";
import { PAGE_TEMPLATES } from "../page-templates";

// Types
export type AlbumStyle = "classic" | "modern" | "collage";
export type ImageOrientation = "portrait" | "landscape" | "square";
export type FrameOrientation = "portrait" | "landscape" | "square";

export interface ImageWithOrientation {
  url: string;
  width: number;
  height: number;
  orientation: ImageOrientation;
}

export interface PageLayout {
  pageNumber: number;
  template: PageTemplate;
  imageAssignments: Array<{
    frameIndex: number;
    imageUrl: string | null;
  }>;
}

export interface AutoLayoutResult {
  pages: PageLayout[];
  totalFrames: number;
  usedFrames: number;
  emptyFrames: number;
}

// Style configuration - determines which templates to use and image density
export const STYLE_CONFIG: Record<
  AlbumStyle,
  {
    categories: PageTemplate["category"][];
    minFrames: number;
    maxFrames: number;
    avgPerPage: number;
  }
> = {
  classic: {
    categories: ["double", "triple"],
    minFrames: 2,
    maxFrames: 3,
    avgPerPage: 2.5,
  },
  modern: {
    categories: ["single", "double"],
    minFrames: 1,
    maxFrames: 2,
    avgPerPage: 1.2, // Conservative estimate accounting for single-frame template preference
  },
  collage: {
    categories: ["quad", "grid", "decorative"],
    minFrames: 3,
    maxFrames: 9,
    avgPerPage: 4.5,
  },
};

/**
 * Determine if a frame is portrait, landscape, or square based on its dimensions
 */
export const getFrameOrientation = (frame: FramePosition): FrameOrientation => {
  const aspectRatio = frame.width / frame.height;
  if (aspectRatio > 1.15) return "landscape";
  if (aspectRatio < 0.85) return "portrait";
  return "square";
};

/**
 * Calculate the minimum number of pages needed for a given image count and style
 * Simulates the template selection algorithm to get an accurate count
 * Always returns an even number (for spreads)
 */
export const calculateMinimumPages = (
  imageCount: number,
  style: AlbumStyle
): number => {
  if (imageCount === 0) return 2;

  // Simulate template selection to get accurate page count
  const eligibleTemplates = getEligibleTemplates(style);
  if (eligibleTemplates.length === 0) return 2;

  let pagesNeeded = 0;
  let imagesPlaced = 0;
  const usedTemplateIds = new Set<string>();

  // Simulate the layout algorithm
  while (imagesPlaced < imageCount) {
    const remainingImages = imageCount - imagesPlaced;

    // Use avgPerPage to estimate which template would be selected
    const config = STYLE_CONFIG[style];
    const targetFrames = Math.min(remainingImages, config.maxFrames);

    // Find template with frame count closest to target
    let bestTemplate = eligibleTemplates[0];
    let minDiff = Math.abs(bestTemplate.frames.length - targetFrames);

    for (const template of eligibleTemplates) {
      const diff = Math.abs(template.frames.length - targetFrames);
      if (diff < minDiff && !usedTemplateIds.has(template.id)) {
        bestTemplate = template;
        minDiff = diff;
      }
    }

    usedTemplateIds.add(bestTemplate.id);
    if (usedTemplateIds.size > 10) {
      usedTemplateIds.clear();
    }

    imagesPlaced += bestTemplate.frames.length;
    pagesNeeded++;
  }

  // Ensure even number (for spreads) and minimum of 2
  const evenPages = pagesNeeded % 2 === 0 ? pagesNeeded : pagesNeeded + 1;
  return Math.max(2, evenPages);
};

/**
 * Get templates that match the style's requirements
 */
const getEligibleTemplates = (style: AlbumStyle): PageTemplate[] => {
  const config = STYLE_CONFIG[style];
  return PAGE_TEMPLATES.filter(
    (t) =>
      config.categories.includes(t.category) &&
      t.frames.length >= config.minFrames &&
      t.frames.length <= config.maxFrames
  );
};

/**
 * Score how well a template matches the upcoming images
 * Higher score = better match
 */
const scoreTemplate = (
  template: PageTemplate,
  remainingImages: ImageWithOrientation[],
  style: AlbumStyle,
  usedTemplateIds: Set<string>
): number => {
  const config = STYLE_CONFIG[style];
  let score = 0;

  // Base score - prefer templates with frame count close to remaining images
  const targetFrameCount = Math.min(
    remainingImages.length,
    config.maxFrames
  );
  const frameDiff = Math.abs(template.frames.length - targetFrameCount);
  score += 10 - frameDiff * 2;

  // Orientation matching score
  template.frames.forEach((frame, idx) => {
    if (idx < remainingImages.length) {
      const frameOrientation = getFrameOrientation(frame);
      const imageOrientation = remainingImages[idx].orientation;

      if (frameOrientation === imageOrientation) {
        score += 5; // Perfect match
      } else if (frameOrientation === "square") {
        score += 2; // Square frames work for any orientation
      } else if (imageOrientation === "square") {
        score += 2; // Square images work in any frame
      }
    }
  });

  // Variety bonus - prefer templates we haven't used recently
  if (!usedTemplateIds.has(template.id)) {
    score += 3;
  }

  // Penalize blank templates unless no images remain
  if (template.frames.length === 0 && remainingImages.length > 0) {
    score -= 100;
  }

  return score;
};

/**
 * Select the best template for the current set of remaining images
 */
const selectBestTemplate = (
  remainingImages: ImageWithOrientation[],
  style: AlbumStyle,
  usedTemplateIds: Set<string>
): PageTemplate => {
  const eligibleTemplates = getEligibleTemplates(style);

  if (eligibleTemplates.length === 0) {
    // Fallback to single or double templates if style has no matches
    return (
      PAGE_TEMPLATES.find((t) => t.id === "double-horizontal-half") ||
      PAGE_TEMPLATES[0]
    );
  }

  // If no more images, still return a template with frames for drag-drop
  if (remainingImages.length === 0) {
    return eligibleTemplates[0];
  }

  // Score all eligible templates
  const scoredTemplates = eligibleTemplates.map((template) => ({
    template,
    score: scoreTemplate(template, remainingImages, style, usedTemplateIds),
  }));

  // Sort by score descending
  scoredTemplates.sort((a, b) => b.score - a.score);

  return scoredTemplates[0]?.template || eligibleTemplates[0];
};

/**
 * Find the best orientation match within the next few images
 * Returns the index of the best match (or current index if no better match found)
 */
const findBestOrientationMatch = (
  images: ImageWithOrientation[],
  currentIndex: number,
  frame: FramePosition,
  lookAhead: number = 3
): number => {
  const frameOrientation = getFrameOrientation(frame);

  // If current image is already a good match, use it
  if (images[currentIndex]?.orientation === frameOrientation) {
    return currentIndex;
  }

  // Look ahead to find a better match
  const endIndex = Math.min(currentIndex + lookAhead, images.length);
  for (let i = currentIndex + 1; i < endIndex; i++) {
    if (images[i].orientation === frameOrientation) {
      return i;
    }
  }

  // No better match found, use current
  return currentIndex;
};

/**
 * Main auto-layout generation function
 *
 * Takes images with orientation data, page count, and style preference
 * Returns a layout plan with template and image assignments for each page
 */
export const generateAutoLayout = (
  images: ImageWithOrientation[],
  pageCount: number,
  style: AlbumStyle
): AutoLayoutResult => {
  const pages: PageLayout[] = [];
  const usedTemplateIds = new Set<string>();
  let imageIndex = 0;

  // Work with a copy of images so we can reorder for better matches
  const imagesCopy = [...images];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const remainingImages = imagesCopy.slice(imageIndex);

    // Check if we should stop creating pages:
    // - All images are placed (imageIndex >= imagesCopy.length)
    // - We've completed a spread (pageNum is even, i.e., right page of spread)
    // This prevents creating completely empty spreads
    if (imageIndex >= imagesCopy.length && pageNum > 1 && (pageNum - 1) % 2 === 1) {
      // We just finished an odd page (left) with no more images
      // Complete this spread by adding one more page, then stop
      const template = selectBestTemplate([], style, usedTemplateIds);
      const imageAssignments = template.frames.map((_, idx) => ({
        frameIndex: idx,
        imageUrl: null,
      }));

      pages.push({
        pageNumber: pageNum,
        template,
        imageAssignments,
      });

      break; // Stop after completing this spread
    } else if (imageIndex >= imagesCopy.length && pageNum > 1 && (pageNum - 1) % 2 === 0) {
      // We just finished an even page (right) with no more images
      // This spread is complete, stop here
      break;
    }

    // Select the best template for remaining images
    const template = selectBestTemplate(remainingImages, style, usedTemplateIds);
    usedTemplateIds.add(template.id);

    // Reset used templates periodically to allow repetition
    if (usedTemplateIds.size > 10) {
      usedTemplateIds.clear();
    }

    // Assign images to frames
    const imageAssignments: PageLayout["imageAssignments"] = [];

    template.frames.forEach((frame, frameIdx) => {
      if (imageIndex < imagesCopy.length) {
        // Try to find a better orientation match in upcoming images
        const bestMatchIdx = findBestOrientationMatch(
          imagesCopy,
          imageIndex,
          frame
        );

        // Swap if a better match was found
        if (bestMatchIdx !== imageIndex) {
          [imagesCopy[imageIndex], imagesCopy[bestMatchIdx]] = [
            imagesCopy[bestMatchIdx],
            imagesCopy[imageIndex],
          ];
        }

        imageAssignments.push({
          frameIndex: frameIdx,
          imageUrl: imagesCopy[imageIndex].url,
        });
        imageIndex++;
      } else {
        // No more images - leave frame empty
        imageAssignments.push({
          frameIndex: frameIdx,
          imageUrl: null,
        });
      }
    });

    pages.push({
      pageNumber: pageNum,
      template,
      imageAssignments,
    });
  }

  // Calculate statistics
  const totalFrames = pages.reduce(
    (sum, p) => sum + p.template.frames.length,
    0
  );
  const usedFrames = pages.reduce(
    (sum, p) =>
      sum + p.imageAssignments.filter((a) => a.imageUrl !== null).length,
    0
  );

  return {
    pages,
    totalFrames,
    usedFrames,
    emptyFrames: totalFrames - usedFrames,
  };
};
