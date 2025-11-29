import { forwardRef } from "react";
import { GripVertical, MoreHorizontal, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Editor } from "@/features/editor/types";

interface PageHandleProps {
  pageNumber: number;
  screenPosition: { left: number; top: number };
  editor: Editor;
  onAddSpreadBefore: () => void;
  onAddSpreadAfter: () => void;
  isDragging?: boolean;
  dragAttributes?: Record<string, any>;
  dragListeners?: Record<string, any>;
  style?: React.CSSProperties;
}

export const PageHandle = forwardRef<HTMLDivElement, PageHandleProps>(({
  pageNumber,
  screenPosition,
  editor,
  onAddSpreadBefore,
  onAddSpreadAfter,
  isDragging = false,
  dragAttributes,
  dragListeners,
  style,
}, ref) => {
  const canMoveLeft = editor.canMovePage(pageNumber, 'left');
  const canMoveRight = editor.canMovePage(pageNumber, 'right');

  const handleMoveLeft = () => {
    if (canMoveLeft) {
      editor.movePage(pageNumber, pageNumber - 1);
    }
  };

  const handleMoveRight = () => {
    if (canMoveRight) {
      editor.movePage(pageNumber, pageNumber + 1);
    }
  };

  return (
    <div
      ref={ref}
      className="absolute flex items-center gap-1 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-md shadow-sm px-1 py-0.5 z-50"
      style={{
        left: screenPosition.left,
        top: screenPosition.top,
        transform: "translateX(-50%)",
        opacity: isDragging ? 0.5 : 1,
        ...style,
      }}
    >
      {/* Drag handle */}
      <div
        className="p-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
        {...dragAttributes}
        {...dragListeners}
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Menu dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[160px]">
          <DropdownMenuItem
            disabled={!canMoveLeft}
            onClick={handleMoveLeft}
            className="cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Move Left
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canMoveRight}
            onClick={handleMoveRight}
            className="cursor-pointer"
          >
            <ChevronRight className="w-4 h-4 mr-2" />
            Move Right
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onAddSpreadBefore} className="cursor-pointer">
            <Plus className="w-4 h-4 mr-2" />
            Add Spread Before
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onAddSpreadAfter} className="cursor-pointer">
            <Plus className="w-4 h-4 mr-2" />
            Add Spread After
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Page number indicator */}
      <span className="text-xs text-gray-500 px-1 font-medium">
        {pageNumber}
      </span>
    </div>
  );
});

PageHandle.displayName = "PageHandle";
