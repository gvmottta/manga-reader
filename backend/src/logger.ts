const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

function timestamp(): string {
  return new Date().toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

console.log = (...args: unknown[]) => {
  originalLog(`[${timestamp()}]`, ...args);
};

console.warn = (...args: unknown[]) => {
  originalWarn(`[${timestamp()}] WARN:`, ...args);
};

console.error = (...args: unknown[]) => {
  originalError(`[${timestamp()}] ERROR:`, ...args);
};
