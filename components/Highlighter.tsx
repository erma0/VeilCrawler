import React from 'react';
import { HighlightRect } from '../types';

interface HighlighterProps {
  rect: HighlightRect | null;
  label?: string;
  isActive: boolean; // True if it's the "selected" one, false if just hovering
}

const Highlighter: React.FC<HighlighterProps> = ({ rect, label, isActive }) => {
  if (!rect) return null;

  const borderColor = isActive ? 'border-green-500' : 'border-blue-400';
  const bgColor = isActive ? 'bg-green-500/10' : 'bg-blue-400/10';
  const labelColor = isActive ? 'bg-green-500' : 'bg-blue-400';

  return (
    <div
      className={`fixed z-50 pointer-events-none transition-all duration-75 ease-out border-2 ${borderColor} ${bgColor}`}
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
    >
      {label && (
        <span
          className={`absolute -top-6 left-0 text-white text-[10px] px-1.5 py-0.5 rounded shadow-sm font-mono truncate max-w-[200px] ${labelColor}`}
        >
          {label}
        </span>
      )}
    </div>
  );
};

export default Highlighter;
