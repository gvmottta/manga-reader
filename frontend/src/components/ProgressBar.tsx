import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import type { TierStats } from "../api/client";

interface ProgressBarProps {
  completed: number;
  total: number;
  status: string;
  error?: string;
  onRetry?: () => void;
  tierStats?: TierStats;
}

export default function ProgressBar({ completed, total, status, error, onRetry, tierStats }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-sm text-muted">
        <span className="flex items-center gap-1.5">
          {status === "error" ? (
            <><XCircle size={14} className="text-red-400" /> Deu ruim</>
          ) : status === "done" ? (
            <><CheckCircle2 size={14} className="text-green-400" /> Prontinho!</>
          ) : (
            <><Loader2 size={14} className="animate-spin text-secondary" /> Traduzindo pra você...</>
          )}
        </span>
        <div className="flex items-center gap-2">
          <span>{completed}/{total} imagens ({pct}%)</span>
          {onRetry && (
            <button
              onClick={onRetry}
              title="Traduzir de novo"
              className="rounded p-1 opacity-40 transition hover:bg-surface-2 hover:opacity-100"
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="h-3 w-full rounded-full bg-surface-2">
        <div
          className={`h-3 rounded-full transition-all duration-500 ${
            status === "error" ? "bg-red-500" : status === "done" ? "bg-green-500" : "bg-secondary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {import.meta.env.DEV && tierStats && (tierStats.ocrFree + tierStats.ocrPaid + tierStats.geminiFree + tierStats.geminiPaid > 0) && (
        <div className="mt-1 flex gap-3 text-xs text-muted">
          {(tierStats.ocrFree > 0 || tierStats.geminiFree > 0) && (
            <span className="text-green-500">
              Gratis: {tierStats.ocrFree > 0 ? `${tierStats.ocrFree} OCR` : ""}{tierStats.ocrFree > 0 && tierStats.geminiFree > 0 ? " + " : ""}{tierStats.geminiFree > 0 ? `${tierStats.geminiFree} trad` : ""}
            </span>
          )}
          {(tierStats.ocrPaid > 0 || tierStats.geminiPaid > 0) && (
            <span className="text-yellow-500">
              Pago: {tierStats.ocrPaid > 0 ? `${tierStats.ocrPaid} OCR` : ""}{tierStats.ocrPaid > 0 && tierStats.geminiPaid > 0 ? " + " : ""}{tierStats.geminiPaid > 0 ? `${tierStats.geminiPaid} trad` : ""}
            </span>
          )}
        </div>
      )}
      {error && (
        <div className="mt-1 flex items-center gap-2">
          <p className="text-sm text-red-400">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300"
            >
              <RefreshCw size={12} /> Tentar de novo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
