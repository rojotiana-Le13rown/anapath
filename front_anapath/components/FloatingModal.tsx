'use client';

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

const MIN_W = 360;
const MIN_H = 220;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type DragState =
  | { mode: 'move'; dx: number; dy: number }
  | { mode: 'e' | 's' | 'se'; px: number; py: number; w: number; h: number; x: number; y: number };

interface FloatingModalProps {
  open: boolean;
  onClose: () => void;
  /** Titre affiché dans la barre (zone de préhension du déplacement). */
  title: ReactNode;
  subtitle?: ReactNode;
  /** Nom d'icône Material Symbols affiché avant le titre. */
  icon?: string;
  /** Icône du bouton de fermeture (« arrow_back » pour un retour). */
  closeIcon?: string;
  /** Classes du bandeau (dégradés des fenêtres existantes). */
  headerClassName?: string;
  children: ReactNode;
  /** Barre d'actions basse fixe (le contenu défile au-dessus). */
  footer?: ReactNode;
  zIndex?: number;
  /** Largeur initiale : part de l'écran plafonnée à maxWidthPx. */
  widthPct?: number;
  heightPct?: number;
  maxWidthPx?: number;
  bodyClassName?: string;
}

const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Fenêtre flottante déplaçable (par son bandeau) et redimensionnable
 * (bord droit, bord bas et coin inférieur droit), clamps à l'écran.
 * Double-clic sur le bandeau : recentrer et retrouver la taille initiale.
 */
export default function FloatingModal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  closeIcon = 'close',
  headerClassName = 'bg-gradient-to-r from-[#00284d] to-[#00478d]',
  children,
  footer,
  zIndex = 50,
  widthPct = 0.95,
  heightPct = 0.9,
  maxWidthPx = 1152,
  bodyClassName = 'p-5',
}: FloatingModalProps) {
  const [rect, setRect] = useState<Rect | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // Position/taille : centrage initial à l'ouverture, re-clamp au redimensionnement
  // de la fenêtre du navigateur ; double-clic sur le bandeau pour réinitialiser.
  const defaultRect = (): Rect => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(vw * widthPct, maxWidthPx);
    const h = vh * heightPct;
    return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
  };

  useEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    setRect(defaultRect());
    const reclamp = () =>
      setRect((prev) => {
        if (!prev) return prev;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const w = clamp(prev.w, MIN_W, vw);
        const h = clamp(prev.h, MIN_H, vh);
        return { w, h, x: clamp(prev.x, 0, vw - w), y: clamp(prev.y, 0, vh - h) };
      });
    window.addEventListener('resize', reclamp);
    return () => window.removeEventListener('resize', reclamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, widthPct, heightPct, maxWidthPx]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !rect) return null;

  const beginMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { mode: 'move', dx: e.clientX - rect.x, dy: e.clientY - rect.y };
  };

  const beginResize = (mode: 'e' | 's' | 'se') => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { mode, px: e.clientX, py: e.clientY, w: rect.w, h: rect.h, x: rect.x, y: rect.y };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (d.mode === 'move') {
      setRect((prev) =>
        prev
          ? { ...prev, x: clamp(e.clientX - d.dx, 0, vw - prev.w), y: clamp(e.clientY - d.dy, 0, vh - prev.h) }
          : prev,
      );
    } else {
      setRect((prev) => {
        if (!prev) return prev;
        let { w, h } = prev;
        if (d.mode !== 's') w = clamp(d.w + (e.clientX - d.px), MIN_W, vw - d.x);
        if (d.mode !== 'e') h = clamp(d.h + (e.clientY - d.py), MIN_H, vh - d.y);
        return { ...prev, w, h };
      });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  return (
    <div className="fixed inset-0 bg-black/40" style={{ zIndex }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="absolute flex flex-col overflow-hidden rounded-xl shadow-xl bg-white"
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        onClick={(e) => e.stopPropagation()}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Bandeau : préhension du déplacement */}
        <div
          className={`flex items-center justify-between p-4 shrink-0 cursor-move touch-none select-none ${headerClassName}`}
          onPointerDown={beginMove}
          onDoubleClick={() => setRect(defaultRect())}
        >
          <div className="flex items-center gap-2 min-w-0">
            {icon && <span className="material-symbols-outlined text-white">{icon}</span>}
            <div className="min-w-0">
              <h3 className="font-bold text-lg text-white truncate">{title}</h3>
              {subtitle && <p className="text-xs text-white/70 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors shrink-0 ml-2"
            aria-label="Fermer"
          >
            <span className="material-symbols-outlined">{closeIcon}</span>
          </button>
        </div>

        <div className={`flex-1 min-h-0 overflow-y-auto ${bodyClassName}`}>{children}</div>

        {footer && <div className="shrink-0">{footer}</div>}

        {/* Poignées de redimensionnement */}
        <div onPointerDown={beginResize('e')} className="absolute top-0 right-0 h-full w-2 cursor-ew-resize touch-none" />
        <div onPointerDown={beginResize('s')} className="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize touch-none" />
        <div onPointerDown={beginResize('se')} className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize touch-none" />
      </div>
    </div>
  );
}
