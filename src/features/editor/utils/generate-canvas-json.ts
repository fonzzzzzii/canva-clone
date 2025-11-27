/**
 * Generates fabric.js canvas JSON with images positioned in a grid layout across multiple pages
 */
export const generateCanvasJsonWithImages = (
  images: Array<{ url: string }> | string[],
  pageWidth: number,
  pageHeight: number,
  pageCount: number
): string => {
  // Handle both string[] and object[] formats for backward compatibility
  const imageUrls = images.map((img) =>
    typeof img === "string" ? img : img.url
  );

  if (imageUrls.length === 0) {
    return "";
  }

  const objects: any[] = [];

  // Calculate images per page
  const imagesPerPage = Math.ceil(imageUrls.length / pageCount);

  // Grid configuration
  const gridCols = imagesPerPage <= 4 ? 2 : 3;
  const padding = 50; // Padding from page edges

  // Calculate cell dimensions
  const availableWidth = pageWidth - (padding * 2);
  const availableHeight = pageHeight - (padding * 2);
  const cellWidth = availableWidth / gridCols;
  const cellHeight = availableHeight / Math.ceil(imagesPerPage / gridCols);

  // Create workspace objects for each page
  const pageSpacing = 20; // Space between pages in a spread
  const spreadSpacing = 100; // Space between spreads

  for (let i = 0; i < pageCount; i++) {
    const pageNumber = i + 1;
    const spreadIndex = Math.floor(i / 2);
    const isLeftPage = i % 2 === 0;

    // Calculate x position for book spread layout
    const spreadStartX = spreadIndex * (2 * pageWidth + pageSpacing + spreadSpacing);
    const xPosition = isLeftPage
      ? spreadStartX
      : spreadStartX + pageWidth + pageSpacing;

    // Create workspace/page object
    objects.push({
      type: "rect",
      version: "5.3.0",
      originX: "left",
      originY: "top",
      left: xPosition,
      top: 0,
      width: pageWidth,
      height: pageHeight,
      fill: "white",
      stroke: null,
      strokeWidth: 0,
      strokeDashArray: null,
      strokeLineCap: "butt",
      strokeDashOffset: 0,
      strokeLineJoin: "miter",
      strokeUniformScaling: false,
      strokeMiterLimit: 4,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      shadow: {
        color: "rgba(0,0,0,0.8)",
        blur: 5,
        offsetX: 0,
        offsetY: 0,
        affectStroke: false,
        nonScaling: false,
      },
      visible: true,
      backgroundColor: "",
      fillRule: "nonzero",
      paintFirst: "fill",
      globalCompositeOperation: "source-over",
      skewX: 0,
      skewY: 0,
      rx: 0,
      ry: 0,
      name: `clip-page-${pageNumber}`,
      selectable: false,
      hasControls: false,
      evented: true,
      pageNumber: pageNumber,
      isPageWorkspace: true,
    });
  }

  // Position images across pages
  imageUrls.forEach((url, idx) => {
    const pageIndex = Math.floor(idx / imagesPerPage);
    const positionInPage = idx % imagesPerPage;

    if (pageIndex >= pageCount) return; // Don't add more images than can fit

    const row = Math.floor(positionInPage / gridCols);
    const col = positionInPage % gridCols;

    // Get the workspace for this image
    const workspace = objects[pageIndex];
    const pageLeft = workspace.left;
    const pageTop = workspace.top;

    // Calculate position within the page
    const x = pageLeft + padding + (col * cellWidth) + (cellWidth / 2);
    const y = pageTop + padding + (row * cellHeight) + (cellHeight / 2);

    // Calculate scale to fit image in cell (assume square images, will be adjusted by fabric.js)
    const targetSize = Math.min(cellWidth, cellHeight) * 0.9; // 90% of cell size for padding

    // Add image object (fabric.js will load and scale it properly)
    objects.push({
      type: "image",
      version: "5.3.0",
      originX: "center",
      originY: "center",
      left: x,
      top: y,
      width: targetSize,
      height: targetSize,
      fill: "rgb(0,0,0)",
      stroke: null,
      strokeWidth: 0,
      strokeDashArray: null,
      strokeLineCap: "butt",
      strokeDashOffset: 0,
      strokeLineJoin: "miter",
      strokeUniformScaling: false,
      strokeMiterLimit: 4,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      shadow: null,
      visible: true,
      backgroundColor: "",
      fillRule: "nonzero",
      paintFirst: "fill",
      globalCompositeOperation: "source-over",
      skewX: 0,
      skewY: 0,
      crossOrigin: "anonymous",
      cropX: 0,
      cropY: 0,
      src: url,
      filters: [],
    });
  });

  const canvasData = {
    version: "5.3.0",
    objects: objects,
  };

  return JSON.stringify(canvasData);
};
