'use client';

import * as React from 'react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

interface ValueTooltipProps {
  /** The tile's title, repeated above the value so a title that truncates in
   *  the tile stays readable. */
  label?: string;
  /** The full, untruncated value. Repeated in the tooltip so a value that
   *  truncates in the tile stays readable. */
  value: string;
  /** Extra detail shown beneath the value (a definition or live equation). */
  detail?: React.ReactNode;
  /** Rendered untouched when neither `label` nor `detail` is supplied. */
  children: React.ReactElement;
}

/**
 * Shared truncate-reveal wrapper for summary tiles.
 *
 * Carries no layout of its own — each page keeps its own tile markup and adds
 * `truncate` to the value itself. This exists so the reveal behaviour has a
 * single definition instead of being re-implemented per page.
 */
export function ValueTooltip({ label, value, detail, children }: ValueTooltipProps) {
  if (!label && !detail) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {label && <p className="text-xs text-slate-400">{label}</p>}
        <p className="font-semibold tabular-nums text-slate-100">{value}</p>
        {detail && <div className="text-xs text-slate-300 mt-1">{detail}</div>}
      </TooltipContent>
    </Tooltip>
  );
}
