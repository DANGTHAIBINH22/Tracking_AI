"use client";
// beui.dev/components/motion/multi-select

import { motion, type Transition } from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { usePopoverPortalPosition } from "@/components/motion/popover-position";
import { useIsClient } from "@/lib/useBrowserState";
import { cn } from "@/lib/utils";
import { useMultiSelectContext, useMultiSelectRefs } from "./context";

type Side = "top" | "bottom";
type Align = "start" | "center" | "end";

// Matches the Combobox surface: the field grows into a panel and then
// separates, preserving a continuous spatial relationship with its trigger.
const MULTI_SELECT_MORPH: Transition = {
  type: "spring",
  duration: 0.5,
  bounce: 0.22,
};
const VIEWPORT_PADDING = 8;

export interface MultiSelectContentProps {
  children: ReactNode;
  side?: Side;
  align?: Align;
  sideOffset?: number;
  avoidCollisions?: boolean;
  className?: string;
}

export function MultiSelectContent({
  children,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  avoidCollisions = true,
  className,
}: MultiSelectContentProps) {
  const context = useMultiSelectContext("MultiSelectContent");
  const { triggerRef, contentRef } = useMultiSelectRefs("MultiSelectContent");
  const measureRef = useRef<HTMLDivElement>(null);
  // The portal needs document.body, so it renders on the client only (was a
  // mount effect setting a flag; useIsClient reads it without the extra pass).
  const portalReady = useIsClient();
  const [morphReady, setMorphReady] = useState(false);
  const layout = usePopoverPortalPosition(
    triggerRef,
    measureRef,
    portalReady,
  );

  useLayoutEffect(() => {
    if (!portalReady) return;
    const readyFrame = requestAnimationFrame(() => setMorphReady(true));
    return () => cancelAnimationFrame(readyFrame);
  }, [portalReady]);

  // Which side has room, derived from the measured layout during render.
  let actualSide: Side = side;
  if (context.open && layout && avoidCollisions) {
    const below =
      window.innerHeight - (layout.trigger.top + layout.trigger.height);
    const above = layout.trigger.top;
    if (side === "bottom" && below < layout.content.height + sideOffset && above > below) {
      actualSide = "top";
    } else if (side === "top" && above < layout.content.height + sideOffset && below > above) {
      actualSide = "bottom";
    }
  }

  if (!portalReady) return null;

  const triggerLeft = layout?.trigger.left ?? 0;
  const triggerWidth = layout?.trigger.width ?? 0;
  const contentWidth = layout?.content.width ?? triggerWidth;
  const desiredLeft =
    align === "end"
      ? triggerLeft + triggerWidth - contentWidth
      : align === "center"
        ? triggerLeft + (triggerWidth - contentWidth) / 2
        : triggerLeft;
  const maxLeft = Math.max(
    VIEWPORT_PADDING,
    window.innerWidth - contentWidth - VIEWPORT_PADDING,
  );
  const left = Math.min(Math.max(desiredLeft, VIEWPORT_PADDING), maxLeft);
  const surfaceHeight = layout?.content.height ?? 0;

  return createPortal(
    <motion.div
      ref={contentRef}
      data-multi-select-content=""
      data-side={actualSide}
      aria-hidden={!context.open}
      inert={!context.open}
      initial={false}
      animate={{
        height: context.open ? surfaceHeight : 0,
        opacity: context.open ? 1 : 0,
        y: context.open
          ? actualSide === "bottom"
            ? sideOffset
            : -sideOffset
          : 0,
      }}
      transition={
        context.reduce || !morphReady ? { duration: 0 } : MULTI_SELECT_MORPH
      }
      style={
        {
          left,
          top:
            actualSide === "bottom" && layout
              ? layout.trigger.top + layout.trigger.height
              : undefined,
          bottom:
            actualSide === "top" && layout
              ? window.innerHeight - layout.trigger.top
              : undefined,
          minWidth: triggerWidth,
          pointerEvents: context.open ? "auto" : "none",
          transformOrigin: actualSide === "bottom" ? "top" : "bottom",
          visibility: layout ? "visible" : "hidden",
          "--multi-select-trigger-width": `${triggerWidth}px`,
        } as CSSProperties
      }
      className={cn(
        "fixed z-[9999] w-(--multi-select-trigger-width) overflow-hidden rounded-xl border border-border bg-white text-foreground shadow-lg outline-none will-change-[height,transform]",
        className,
      )}
    >
      <motion.div
        ref={measureRef}
        initial={false}
        animate={{ opacity: context.open ? 1 : 0 }}
        transition={
          context.reduce || !morphReady ? { duration: 0 } : MULTI_SELECT_MORPH
        }
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
