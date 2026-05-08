import { type CSSProperties } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn } from '@/lib/utils';

const DEFAULT_COLORS = [
  '#ff6b35', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6',
  '#ec4899', '#6b7280', '#1e293b', '#ffffff',
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  colors?: string[];
  className?: string;
}

function ColorPicker({
  value,
  onChange,
  colors = DEFAULT_COLORS,
  className,
}: ColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5',
            'text-sm bg-transparent hover:bg-surface-hover transition-colors cursor-pointer',
            className,
          )}
          type="button"
        >
          <span
            className="block h-4 w-4 rounded-full border border-border/50 shrink-0 bg-[var(--bg)]"
            style={{ '--bg': value } as CSSProperties}
          />
          <span className="text-text-secondary">{value}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="grid grid-cols-4 gap-2" role="listbox" aria-label="Color palette">
          {colors.map((color) => (
            <button
              key={color}
              role="option"
              aria-selected={value === color}
              className={cn(
                'h-8 w-8 rounded-full border-2 transition-all cursor-pointer bg-[var(--bg)]',
                'hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                value === color ? 'border-primary ring-2 ring-primary/30' : 'border-transparent',
              )}
              style={{ '--bg': color } as CSSProperties}
              onClick={() => onChange(color)}
              title={color}
              type="button"
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
ColorPicker.displayName = 'ColorPicker';

export { ColorPicker, DEFAULT_COLORS };
export type { ColorPickerProps };
