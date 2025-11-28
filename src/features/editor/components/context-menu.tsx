"use client";

import { useEffect, useRef } from "react";
import {
  Copy,
  Clipboard,
  Trash,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Group,
  Ungroup,
  Lock,
  Unlock,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Editor } from "@/features/editor/types";

interface ContextMenuProps {
  x: number;
  y: number;
  visible: boolean;
  onClose: () => void;
  editor: Editor | undefined;
  hasClipboard: boolean;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

const MenuItem = ({ icon, label, shortcut, onClick, disabled, destructive }: MenuItemProps) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "flex items-center w-full px-3 py-1.5 text-sm rounded-sm transition-colors",
      "hover:bg-accent focus:bg-accent outline-none",
      disabled && "opacity-50 cursor-not-allowed pointer-events-none",
      destructive && "text-red-600 hover:text-red-600 hover:bg-red-50"
    )}
  >
    <span className="w-5 h-5 mr-2 flex items-center justify-center">{icon}</span>
    <span className="flex-1 text-left">{label}</span>
    {shortcut && (
      <span className="ml-4 text-xs text-muted-foreground">{shortcut}</span>
    )}
  </button>
);

const MenuSeparator = () => <div className="h-px bg-border my-1" />;

const MenuLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
    {children}
  </div>
);

export const ContextMenu = ({
  x,
  y,
  visible,
  onClose,
  editor,
  hasClipboard,
}: ContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedCount = editor?.selectedObjects?.length || 0;
  const hasSelection = selectedCount > 0;
  const hasMultipleSelection = selectedCount > 1;
  const isLocked = editor?.isLocked() || false;
  const isGrouped = editor?.isGrouped() || false;

  // Handle click outside
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [visible, onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!visible || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 10;
    }
    if (y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 10;
    }

    menu.style.left = `${adjustedX}px`;
    menu.style.top = `${adjustedY}px`;
  }, [x, y, visible]);

  if (!visible) return null;

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[200px] bg-popover border rounded-md shadow-lg p-1 animate-in fade-in-0 zoom-in-95"
      style={{ left: x, top: y }}
    >
      {/* Edit Actions */}
      <MenuItem
        icon={<Copy className="w-4 h-4" />}
        label="Copy"
        shortcut="⌘C"
        onClick={() => handleAction(() => editor?.onCopy())}
        disabled={!hasSelection}
      />
      <MenuItem
        icon={<Clipboard className="w-4 h-4" />}
        label="Paste"
        shortcut="⌘V"
        onClick={() => handleAction(() => editor?.onPaste())}
        disabled={!hasClipboard}
      />
      <MenuItem
        icon={<Copy className="w-4 h-4" />}
        label="Duplicate"
        shortcut="⌘D"
        onClick={() => handleAction(() => editor?.duplicate())}
        disabled={!hasSelection}
      />
      <MenuItem
        icon={<Trash className="w-4 h-4" />}
        label="Delete"
        shortcut="⌫"
        onClick={() => handleAction(() => editor?.delete())}
        disabled={!hasSelection}
        destructive
      />

      <MenuSeparator />

      {/* Ordering */}
      <MenuLabel>Order</MenuLabel>
      <MenuItem
        icon={<ChevronsUp className="w-4 h-4" />}
        label="Bring to Front"
        onClick={() => handleAction(() => editor?.bringToFront())}
        disabled={!hasSelection}
      />
      <MenuItem
        icon={<ArrowUp className="w-4 h-4" />}
        label="Bring Forward"
        onClick={() => handleAction(() => editor?.bringForward())}
        disabled={!hasSelection}
      />
      <MenuItem
        icon={<ArrowDown className="w-4 h-4" />}
        label="Send Backward"
        onClick={() => handleAction(() => editor?.sendBackwards())}
        disabled={!hasSelection}
      />
      <MenuItem
        icon={<ChevronsDown className="w-4 h-4" />}
        label="Send to Back"
        onClick={() => handleAction(() => editor?.sendToBack())}
        disabled={!hasSelection}
      />

      <MenuSeparator />

      {/* Group/Ungroup */}
      {hasMultipleSelection && !isGrouped && (
        <MenuItem
          icon={<Group className="w-4 h-4" />}
          label="Group"
          shortcut="⌘G"
          onClick={() => handleAction(() => editor?.groupSelected())}
        />
      )}
      {isGrouped && (
        <MenuItem
          icon={<Ungroup className="w-4 h-4" />}
          label="Ungroup"
          shortcut="⇧⌘G"
          onClick={() => handleAction(() => editor?.ungroupSelected())}
        />
      )}

      {/* Lock/Unlock */}
      {hasSelection && !isLocked && (
        <MenuItem
          icon={<Lock className="w-4 h-4" />}
          label="Lock"
          onClick={() => handleAction(() => editor?.lockSelected())}
        />
      )}
      {isLocked && (
        <MenuItem
          icon={<Unlock className="w-4 h-4" />}
          label="Unlock"
          onClick={() => handleAction(() => editor?.unlockSelected())}
        />
      )}

      <MenuSeparator />

      {/* Alignment */}
      <MenuLabel>Align</MenuLabel>
      <div className="flex px-2 py-1 gap-1">
        <button
          onClick={() => handleAction(() => editor?.alignLeft(true))}
          disabled={!hasSelection}
          className="p-1.5 rounded hover:bg-accent disabled:opacity-50"
          title="Align Left"
        >
          <AlignStartVertical className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleAction(() => editor?.alignCenterHorizontal(true))}
          disabled={!hasSelection}
          className="p-1.5 rounded hover:bg-accent disabled:opacity-50"
          title="Align Center Horizontal"
        >
          <AlignCenterVertical className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleAction(() => editor?.alignRight(true))}
          disabled={!hasSelection}
          className="p-1.5 rounded hover:bg-accent disabled:opacity-50"
          title="Align Right"
        >
          <AlignEndVertical className="w-4 h-4" />
        </button>
        <div className="w-px bg-border mx-1" />
        <button
          onClick={() => handleAction(() => editor?.alignTop(true))}
          disabled={!hasSelection}
          className="p-1.5 rounded hover:bg-accent disabled:opacity-50"
          title="Align Top"
        >
          <AlignStartHorizontal className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleAction(() => editor?.alignCenterVertical(true))}
          disabled={!hasSelection}
          className="p-1.5 rounded hover:bg-accent disabled:opacity-50"
          title="Align Center Vertical"
        >
          <AlignCenterHorizontal className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleAction(() => editor?.alignBottom(true))}
          disabled={!hasSelection}
          className="p-1.5 rounded hover:bg-accent disabled:opacity-50"
          title="Align Bottom"
        >
          <AlignEndHorizontal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
