'use client';

import { useEffect, useRef } from 'react';

type Props = {
  kicker: string;
  title: string;
  /** Icon id under /public/ui/icons — the object's own render. */
  icon?: string;
  onClose: () => void;
  children: React.ReactNode;
};

export default function Panel({ kicker, title, icon, onClose, children }: Props) {
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    box.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="scrim" onClick={onClose} role="presentation">
      <div
        className="panel"
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-inner">
          <div className="panel-head">
            {icon && (
              <img className="panel-icon" src={`/ui/icons/${icon}.png`} alt="" aria-hidden="true" />
            )}
            <div>
              <div className="kicker">{kicker}</div>
              <h2>{title}</h2>
            </div>
            <button className="panel-close" onClick={onClose} aria-label="close">
              ✕
            </button>
          </div>
          <div className="panel-body">{children}</div>
        </div>
      </div>
    </div>
  );
}
