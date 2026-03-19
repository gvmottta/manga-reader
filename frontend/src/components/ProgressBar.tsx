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
        <span>
          {status === "error" ? "Error" : status === "done" ? "Done" : `Translating...`}
        </span>
        <div className="flex items-center gap-2">
          <span>{completed}/{total} images ({pct}%)</span>
          {onRetry && (
            <button
              onClick={onRetry}
              title="Refazer tradução"
              className="opacity-30 transition-opacity hover:opacity-100"
            >
              ↺
            </button>
          )}
        </div>
      </div>
      <div className="h-3 w-full rounded-full bg-gray-800">
        <div
          className={`h-3 rounded-full transition-all duration-300 ${
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
              className="text-sm text-red-400 hover:text-red-300"
            >
              ↺ Tentar novamente
            </button>
          )}
        </div>
      )}
    </div>
  );
}
