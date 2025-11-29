import { useState, useEffect, useRef } from "react";
import { fabric } from "fabric";

import {
  FaBold,
  FaItalic,
  FaStrikethrough,
  FaUnderline
} from "react-icons/fa";
import { TbColorFilter } from "react-icons/tb";
import { BsBorderWidth } from "react-icons/bs";
import { RxTransparencyGrid } from "react-icons/rx";
import {
  ArrowUp,
  ArrowDown,
  ChevronDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash,
  SquareSplitHorizontal,
  Copy,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
  Frame,
  Square
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

import { isTextType } from "@/features/editor/utils";
import { isFrameType } from "@/features/editor/objects/image-frame";
import { FontSizeInput } from "@/features/editor/components/font-size-input";
import {
  ActiveTool,
  Editor,
  FONT_SIZE,
  FONT_WEIGHT
} from "@/features/editor/types";

import { cn } from "@/lib/utils";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";

interface ToolbarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
};

export const Toolbar = ({
  editor,
  activeTool,
  onChangeActiveTool,
}: ToolbarProps) => {
  const initialFillColor = editor?.getActiveFillColor();
  const initialStrokeColor = editor?.getActiveStrokeColor();
  const initialFontFamily = editor?.getActiveFontFamily();
  const initialFontWeight = editor?.getActiveFontWeight() || FONT_WEIGHT;
  const initialFontStyle = editor?.getActiveFontStyle();
  const initialFontLinethrough = editor?.getActiveFontLinethrough();
  const initialFontUnderline = editor?.getActiveFontUnderline();
  const initialTextAlign = editor?.getActiveTextAlign();
  const initialFontSize = editor?.getActiveFontSize() || FONT_SIZE

  const [properties, setProperties] = useState({
    fillColor: initialFillColor,
    strokeColor: initialStrokeColor,
    fontFamily: initialFontFamily,
    fontWeight: initialFontWeight,
    fontStyle: initialFontStyle,
    fontLinethrough: initialFontLinethrough,
    fontUnderline: initialFontUnderline,
    textAlign: initialTextAlign,
    fontSize: initialFontSize,
  });

  // Align to page state - preserved across alignments but reset on selection change
  const selectedCount = editor?.selectedObjects?.length || 0;
  const [alignToPage, setAlignToPage] = useState(false);

  // Track selection by object references (stable across position changes)
  const lastSelectionRef = useRef<fabric.Object[] | null>(null);

  useEffect(() => {
    const currentSelection = editor?.selectedObjects || null;
    const lastSelection = lastSelectionRef.current;

    // Check if this is actually a different selection (not just position changes)
    // Compare by object reference, not by properties
    const isDifferentSelection =
      !lastSelection ||
      !currentSelection ||
      lastSelection.length !== currentSelection.length ||
      !lastSelection.every((obj, idx) => obj === currentSelection[idx]);

    if (isDifferentSelection) {
      setAlignToPage(false);
      lastSelectionRef.current = currentSelection ? [...currentSelection] : null;
    }
  }, [editor?.selectedObjects]);

  // For single object selection, always align to page (checkbox disabled but checked)
  const isSingleSelection = selectedCount === 1;
  const effectiveAlignToPage = isSingleSelection ? true : alignToPage;

  const selectedObject = editor?.selectedObjects[0];
  const selectedObjectType = editor?.selectedObjects[0]?.type;

  const isText = isTextType(selectedObjectType);
  const isImage = selectedObjectType === "image";
  const isFramedImage = isFrameType(selectedObjectType) || selectedObjectType === "framedImage";

  const onChangeFontSize = (value: number) => {
    if (!selectedObject) {
      return;
    }

    editor?.changeFontSize(value);
    setProperties((current) => ({
      ...current,
      fontSize: value,
    }));
  };

  const onChangeTextAlign = (value: string) => {
    if (!selectedObject) {
      return;
    }

    editor?.changeTextAlign(value);
    setProperties((current) => ({
      ...current,
      textAlign: value,
    }));
  };

  const toggleBold = () => {
    if (!selectedObject) {
      return;
    }

    const newValue = properties.fontWeight > 500 ? 500 : 700;

    editor?.changeFontWeight(newValue);
    setProperties((current) => ({
      ...current,
      fontWeight: newValue,
    }));
  };

  const toggleItalic = () => {
    if (!selectedObject) {
      return;
    }

    const isItalic = properties.fontStyle === "italic";
    const newValue = isItalic ? "normal" : "italic";

    editor?.changeFontStyle(newValue);
    setProperties((current) => ({
      ...current,
      fontStyle: newValue,
    }));
  };

  const toggleLinethrough = () => {
    if (!selectedObject) {
      return;
    }

    const newValue = properties.fontLinethrough ? false : true;

    editor?.changeFontLinethrough(newValue);
    setProperties((current) => ({
      ...current,
      fontLinethrough: newValue,
    }));
  };

  const toggleUnderline = () => {
    if (!selectedObject) {
      return;
    }

    const newValue = properties.fontUnderline ? false : true;

    editor?.changeFontUnderline(newValue);
    setProperties((current) => ({
      ...current,
      fontUnderline: newValue,
    }));
  };

  if (editor?.selectedObjects.length === 0) {
    return (
      <div className="shrink-0 h-[56px] border-b bg-white w-full flex items-center overflow-x-auto z-[49] p-2 gap-x-2" />
    );
  }

  return (
    <div className="shrink-0 h-[56px] border-b bg-white w-full flex items-center overflow-x-auto z-[49] p-2 gap-x-2">
      {!isImage && (
        <div className="flex items-center h-full justify-center">
          <Hint label="Color" side="bottom" sideOffset={5}>
            <Button
              onClick={() => onChangeActiveTool("fill")}
              size="icon"
              variant="ghost"
              className={cn(
                activeTool === "fill" && "bg-gray-100"
              )}
            >
              <div
                className="rounded-sm size-4 border"
                style={{ backgroundColor: properties.fillColor }}
              />
            </Button>
          </Hint>
        </div>
      )}
      {!isText && (
        <div className="flex items-center h-full justify-center">
          <Hint label="Stroke color" side="bottom" sideOffset={5}>
            <Button
              onClick={() => onChangeActiveTool("stroke-color")}
              size="icon"
              variant="ghost"
              className={cn(
                activeTool === "stroke-color" && "bg-gray-100"
              )}
            >
              <div
                className="rounded-sm size-4 border-2 bg-white"
                style={{ borderColor: properties.strokeColor }}
              />
            </Button>
          </Hint>
        </div>
      )}
      {!isText && (
        <div className="flex items-center h-full justify-center">
          <Hint label="Stroke width" side="bottom" sideOffset={5}>
            <Button
              onClick={() => onChangeActiveTool("stroke-width")}
              size="icon"
              variant="ghost"
              className={cn(
                activeTool === "stroke-width" && "bg-gray-100"
              )}
            >
              <BsBorderWidth className="size-4" />
            </Button>
          </Hint>
        </div>
      )}
      {isText && (
        <div className="flex items-center h-full justify-center">
          <Hint label="Font" side="bottom" sideOffset={5}>
            <Button
              onClick={() => onChangeActiveTool("font")}
              size="icon"
              variant="ghost"
              className={cn(
                "w-auto px-2 text-sm",
                activeTool === "font" && "bg-gray-100"
              )}
            >
              <div className="max-w-[100px] truncate">
                {properties.fontFamily}
              </div>
              <ChevronDown className="size-4 ml-2 shrink-0" />
            </Button>
          </Hint>
        </div>
      )}
      {isText && (
        <div className="flex items-center h-full justify-center">
          <Hint label="Bold" side="bottom" sideOffset={5}>
            <Button
              onClick={toggleBold}
              size="icon"
              variant="ghost"
              className={cn(
                properties.fontWeight > 500 && "bg-gray-100"
              )}
            >
              <FaBold className="size-4" />
            </Button>
          </Hint>
        </div>
      )}
      {isText && (
        <div className="flex items-center h-full justify-center">
          <Hint label="Italic" side="bottom" sideOffset={5}>
            <Button
              onClick={toggleItalic}
              size="icon"
              variant="ghost"
              className={cn(
                properties.fontStyle === "italic" && "bg-gray-100"
              )}
            >
              <FaItalic className="size-4" />
            </Button>
          </Hint>
        </div>
      )}
      {isText && (
        <div className="flex items-center h-full justify-center">
          <Hint label="Underline" side="bottom" sideOffset={5}>
            <Button
              onClick={toggleUnderline}
              size="icon"
              variant="ghost"
              className={cn(
                properties.fontUnderline && "bg-gray-100"
              )}
            >
              <FaUnderline className="size-4" />
            </Button>
          </Hint>
        </div>
      )}
      {isText && (
        <div className="flex items-center h-full justify-center">
          <Hint label="Strike" side="bottom" sideOffset={5}>
            <Button
              onClick={toggleLinethrough}
              size="icon"
              variant="ghost"
              className={cn(
                properties.fontLinethrough && "bg-gray-100"
              )}
            >
              <FaStrikethrough className="size-4" />
            </Button>
          </Hint>
        </div>
      )}
      {isText && (
        <div className="flex items-center h-full justify-center">
          <Hint label="Align left" side="bottom" sideOffset={5}>
            <Button
              onClick={() => onChangeTextAlign("left")}
              size="icon"
              variant="ghost"
              className={cn(
                properties.textAlign === "left" && "bg-gray-100"
              )}
            >
              <AlignLeft className="size-4" />
            </Button>
          </Hint>
        </div>
      )}
      {isText && (
        <div className="flex items-center h-full justify-center">
          <Hint label="Align center" side="bottom" sideOffset={5}>
            <Button
              onClick={() => onChangeTextAlign("center")}
              size="icon"
              variant="ghost"
              className={cn(
                properties.textAlign === "center" && "bg-gray-100"
              )}
            >
              <AlignCenter className="size-4" />
            </Button>
          </Hint>
        </div>
      )}
      {isText && (
        <div className="flex items-center h-full justify-center">
          <Hint label="Align right" side="bottom" sideOffset={5}>
            <Button
              onClick={() => onChangeTextAlign("right")}
              size="icon"
              variant="ghost"
              className={cn(
                properties.textAlign === "right" && "bg-gray-100"
              )}
            >
              <AlignRight className="size-4" />
            </Button>
          </Hint>
        </div>
      )}
      {isText && (
        <div className="flex items-center h-full justify-center">
         <FontSizeInput
            value={properties.fontSize}
            onChange={onChangeFontSize}
         />
        </div>
      )}
      {isFramedImage && (
        <div className="flex items-center h-full justify-center">
          <Hint label="Frame" side="bottom" sideOffset={5}>
            <Button
              onClick={() => onChangeActiveTool("image-frame")}
              size="icon"
              variant="ghost"
              className={cn(
                activeTool === "image-frame" && "bg-gray-100"
              )}
            >
              <Frame className="size-4" />
            </Button>
          </Hint>
        </div>
      )}
      {isImage && (
        <div className="flex items-center h-full justify-center">
          <Hint label="Filters" side="bottom" sideOffset={5}>
            <Button
              onClick={() => onChangeActiveTool("filter")}
              size="icon"
              variant="ghost"
              className={cn(
                activeTool === "filter" && "bg-gray-100"
              )}
            >
              <TbColorFilter className="size-4" />
            </Button>
          </Hint>
        </div>
      )}
      {isImage && (
        <div className="flex items-center h-full justify-center">
          <Hint label="Remove background" side="bottom" sideOffset={5}>
            <Button
              onClick={() => onChangeActiveTool("remove-bg")}
              size="icon"
              variant="ghost"
              className={cn(
                activeTool === "remove-bg" && "bg-gray-100"
              )}
            >
              <SquareSplitHorizontal className="size-4" />
            </Button>
          </Hint>
        </div>
      )}
      <div className="flex items-center h-full justify-center">
        <Hint label="Bring forward" side="bottom" sideOffset={5}>
          <Button
            onClick={() => editor?.bringForward()}
            size="icon"
            variant="ghost"
          >
            <ArrowUp className="size-4" />
          </Button>
        </Hint>
      </div>
      <div className="flex items-center h-full justify-center">
        <Hint label="Send backwards" side="bottom" sideOffset={5}>
          <Button
            onClick={() => editor?.sendBackwards()}
            size="icon"
            variant="ghost"
          >
            <ArrowDown className="size-4" />
          </Button>
        </Hint>
      </div>
      <div className="flex items-center h-full justify-center">
        <Hint label="Opacity" side="bottom" sideOffset={5}>
          <Button
            onClick={() => onChangeActiveTool("opacity")}
            size="icon"
            variant="ghost"
            className={cn(activeTool === "opacity" && "bg-gray-100")}
          >
            <RxTransparencyGrid className="size-4" />
          </Button>
        </Hint>
      </div>
      <div className="flex items-center h-full justify-center">
        <Hint label="Duplicate" side="bottom" sideOffset={5}>
          <Button
            onClick={() => {
              editor?.onCopy();
              editor?.onPaste();
            }}
            size="icon"
            variant="ghost"
          >
            <Copy className="size-4" />
          </Button>
        </Hint>
      </div>
      <div className="flex items-center h-full justify-center">
        <Hint label="Delete" side="bottom" sideOffset={5}>
          <Button
            onClick={() => editor?.delete()}
            size="icon"
            variant="ghost"
            className="text-red-600"
          >
            <Trash className="size-4" />
          </Button>
        </Hint>
      </div>
      {selectedCount >= 1 && (
        <>
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <div className="flex items-center h-full justify-center gap-1 px-2">
            <Checkbox
              id="align-to-page"
              checked={effectiveAlignToPage}
              onCheckedChange={(checked) => setAlignToPage(checked === true)}
              disabled={isSingleSelection}
              className="size-3.5"
            />
            <label
              htmlFor="align-to-page"
              className={cn(
                "text-xs text-muted-foreground select-none whitespace-nowrap",
                isSingleSelection ? "cursor-not-allowed opacity-50" : "cursor-pointer"
              )}
            >
              To page
            </label>
          </div>
          <div className="flex items-center h-full justify-center">
            <Hint label="Align left" side="bottom" sideOffset={5}>
              <Button
                onClick={() => editor?.alignLeft(effectiveAlignToPage)}
                size="icon"
                variant="ghost"
              >
                <AlignStartVertical className="size-4" />
              </Button>
            </Hint>
          </div>
          <div className="flex items-center h-full justify-center">
            <Hint label="Align center horizontal" side="bottom" sideOffset={5}>
              <Button
                onClick={() => editor?.alignCenterHorizontal(effectiveAlignToPage)}
                size="icon"
                variant="ghost"
              >
                <AlignCenterVertical className="size-4" />
              </Button>
            </Hint>
          </div>
          <div className="flex items-center h-full justify-center">
            <Hint label="Align right" side="bottom" sideOffset={5}>
              <Button
                onClick={() => editor?.alignRight(effectiveAlignToPage)}
                size="icon"
                variant="ghost"
              >
                <AlignEndVertical className="size-4" />
              </Button>
            </Hint>
          </div>
          <div className="flex items-center h-full justify-center">
            <Hint label="Align top" side="bottom" sideOffset={5}>
              <Button
                onClick={() => editor?.alignTop(effectiveAlignToPage)}
                size="icon"
                variant="ghost"
              >
                <AlignStartHorizontal className="size-4" />
              </Button>
            </Hint>
          </div>
          <div className="flex items-center h-full justify-center">
            <Hint label="Align middle vertical" side="bottom" sideOffset={5}>
              <Button
                onClick={() => editor?.alignCenterVertical(effectiveAlignToPage)}
                size="icon"
                variant="ghost"
              >
                <AlignCenterHorizontal className="size-4" />
              </Button>
            </Hint>
          </div>
          <div className="flex items-center h-full justify-center">
            <Hint label="Align bottom" side="bottom" sideOffset={5}>
              <Button
                onClick={() => editor?.alignBottom(effectiveAlignToPage)}
                size="icon"
                variant="ghost"
              >
                <AlignEndHorizontal className="size-4" />
              </Button>
            </Hint>
          </div>
          {selectedCount > 2 && !alignToPage && (
            <>
              <div className="w-px h-6 bg-gray-300 mx-1" />
              <div className="flex items-center h-full justify-center">
                <Hint label="Distribute horizontal" side="bottom" sideOffset={5}>
                  <Button
                    onClick={() => editor?.distributeHorizontal()}
                    size="icon"
                    variant="ghost"
                  >
                    <AlignHorizontalSpaceBetween className="size-4" />
                  </Button>
                </Hint>
              </div>
              <div className="flex items-center h-full justify-center">
                <Hint label="Distribute vertical" side="bottom" sideOffset={5}>
                  <Button
                    onClick={() => editor?.distributeVertical()}
                    size="icon"
                    variant="ghost"
                  >
                    <AlignVerticalSpaceBetween className="size-4" />
                  </Button>
                </Hint>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
