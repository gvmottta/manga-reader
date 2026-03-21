import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";

interface ProgressBarProps {
  completed: number;
  total: number;
  status: string;
  error?: string;
  onRetry?: () => void;
}

export default function ProgressBar({ completed, total, status, error, onRetry }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-sm text-gray-400">
        <span className="flex items-center gap-1.5">
          {status === "error" ? (
            <><XCircle size={14} className="text-red-400" /> Erro</>
          ) : status === "done" ? (
            <><CheckCircle2 size={14} className="text-green-400" /> Tradução concluída</>
          ) : (
            <><Loader2 size={14} className="animate-spin text-purple-400" /> Traduzindo...</>
          )}
        </span>
        <div className="flex items-center gap-2">
          <span>{completed}/{total} imagens ({pct}%)</span>
          {onRetry && (
            <button
              onClick={onRetry}
              title="Refazer tradução"
              className="rounded p-1 opacity-40 transition hover:bg-gray-800 hover:opacity-100"
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="h-3 w-full rounded-full bg-gray-800">
        <div
          className={`h-3 rounded-full transition-all duration-500 ${
            status === "error" ? "bg-red-500" : status === "done" ? "bg-green-500" : "bg-purple-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {error && (
        <div className="mt-1 flex items-center gap-2">
          <p className="text-sm text-red-400">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300"
            >
              <RefreshCw size={12} /> Tentar novamente
            </button>
          )}
        </div>
      )}
    </div>
  );
}
