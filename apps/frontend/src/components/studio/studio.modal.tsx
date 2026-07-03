'use client';

// StudioModal — a reusable centered modal overlay for the Studio (portal-based, so it escapes any
// tab's overflow/stacking). Dark-mode-first Postiz tokens; magenta bg-ai accent belongs to the
// content, not the chrome. Used for the avatar Create / Resume flows so the tab canvas stays clean.
//
// - Click the backdrop or the × to close (unless `dismissible={false}` while a step is mid-flight).
// - Optional `steps` + `activeStep` render a lightweight stepper under the title.
// - Body scrolls inside the modal; the page never scrolls behind it.

import { FC, ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

export const StudioModal: FC<{
  title: string;
  subtitle?: string;
  steps?: string[];
  activeStep?: number;
  onClose: () => void;
  dismissible?: boolean;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}> = ({ title, subtitle, steps, activeStep = 0, onClose, dismissible = true, width = 560, children, footer }) => {
  // Esc to close; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && dismissible) onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose, dismissible]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-[20px]"
      onClick={() => dismissible && onClose()}
    >
      <div
        className="flex flex-col w-full max-h-[88vh] rounded-[12px] border border-newBorder bg-newBgColor shadow-2xl"
        style={{ maxWidth: `${width}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-[12px] px-[20px] pt-[18px] pb-[14px] border-b border-newBorder">
          <div className="flex flex-col gap-[3px] min-w-0">
            <h3 className="text-[15px] font-[600] text-btnText leading-[1.3] truncate">{title}</h3>
            {subtitle && <p className="text-[12px] text-textItemBlur leading-[1.45]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-[30px] h-[30px] rounded-[8px] bg-btnSimple text-textItemBlur hover:text-btnText text-[16px] leading-none flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Stepper */}
        {steps && steps.length > 0 && (
          <div className="flex items-center gap-[6px] px-[20px] py-[12px] border-b border-newBorder flex-wrap">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-[6px]">
                <span
                  className={clsx(
                    'inline-flex items-center gap-[6px] text-[11px] font-[600] px-[8px] h-[24px] rounded-[6px]',
                    i === activeStep ? 'bg-ai text-btnText' : i < activeStep ? 'text-btnText' : 'text-textItemBlur'
                  )}
                >
                  <span
                    className={clsx(
                      'w-[16px] h-[16px] rounded-full text-[10px] flex items-center justify-center leading-none',
                      i === activeStep ? 'bg-btnText/20' : i < activeStep ? 'bg-ai text-btnText' : 'border border-newBorder'
                    )}
                  >
                    {i < activeStep ? '✓' : i + 1}
                  </span>
                  {s}
                </span>
                {i < steps.length - 1 && <span className="text-textItemBlur text-[12px]" aria-hidden="true">›</span>}
              </div>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-[20px] py-[18px]">{children}</div>

        {/* Footer (optional) */}
        {footer && <div className="px-[20px] py-[14px] border-t border-newBorder">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};
