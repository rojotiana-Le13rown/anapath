'use client';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Fenêtre de confirmation générique — thème bleu marine/blanc, remplace window.confirm(). */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#00203a]/50 backdrop-blur-sm p-4 overlay-in"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-[95vw] overflow-hidden modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-[#00284d] to-[#00478d] px-5 py-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-white text-2xl">
            {danger ? 'warning' : 'help'}
          </span>
          <h3 className="text-white font-bold text-base">{title}</h3>
        </div>
        <div className="p-5">
          <p className="text-sm text-slate-600">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-[#00478d] hover:bg-[#00478d]/10 rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm transition-all hover:shadow-md active:scale-95 ${
              danger
                ? 'bg-gradient-to-r from-red-600 to-red-700 hover:opacity-90'
                : 'bg-gradient-to-r from-[#00478d] to-[#005eb8] hover:opacity-90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
