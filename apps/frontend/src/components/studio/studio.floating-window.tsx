'use client';

// A portable, draggable floating window — a portal pinned to the viewport that the user
// can move anywhere by its title bar. Used to float the Studio agent chat over the Brand
// page. Postiz tokens only.

import { FC, ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const FloatingWindow: FC<{
  title: string;
  onClose: () => void;
  width?: number;
  height?: number;
  children: ReactNode;
}> = ({ title, onClose, width = 360, height = 560, children }) => {
  const [pos, setPos] = useState(() => ({
    x: typeof window !== 'undefined' ? Math.max(16, window.innerWidth - width - 40) : 40,
    y: 96,
  }));
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      const x = Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - 80);
      const y = Math.min(Math.max(0, e.clientY - drag.current.dy), window.innerHeight - 40);
      setPos({ x, y });
    };
    const onUp = () => { drag.current = null; document.body.style.userSelect = ''; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    document.body.style.userSelect = 'none';
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed z-[1200] rounded-[12px] border border-newBorder bg-newBgColor shadow-2xl flex flex-col overflow-hidden"
      style={{ left: pos.x, top: pos.y, width, height, maxHeight: '90vh' }}
    >
      <div
        onMouseDown={startDrag}
        className="flex items-center gap-[8px] px-[12px] py-[10px] border-b border-newBorder cursor-move select-none bg-newBgColorInner"
      >
        <span className="w-[8px] h-[8px] rounded-full bg-ai shrink-0" />
        <span className="text-[13px] font-[700] text-btnText flex-1 truncate">{title}</span>
        <button type="button" onClick={onClose} aria-label="Close window"
          className="text-textItemBlur hover:text-btnText text-[18px] leading-none">×</button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>,
    document.body
  );
};

export default FloatingWindow;
