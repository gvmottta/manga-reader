interface ProgressBarProps {
  completed: number;
  total: number;
  status: string;
  error?: string;
}

export default function ProgressBar({ completed, total, status, error }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-sm text-gray-400">
        <span>
          {status === "error" ? "Error" : status === "done" ? "Done" : `Translating...`}
        </span>
        <span>{completed}/{total} images ({pct}%)</span>
      </div>
      <div className="h-3 w-full rounded-full bg-gray-800">
        <div
          className={`h-3 rounded-full transition-all duration-300 ${
            status === "error" ? "bg-red-500" : status === "done" ? "bg-green-500" : "bg-purple-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}
