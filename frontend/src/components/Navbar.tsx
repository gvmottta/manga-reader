import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

interface NavbarProps {
  backTo?: { href: string; label: string };
}

export default function Navbar({ backTo }: NavbarProps) {
  return (
    <header
      className="border-b border-gray-800 px-4"
      style={{
        paddingTop: "calc(0.75rem + var(--safe-top))",
        paddingBottom: "0.75rem",
      }}
    >
      <div className="flex items-center gap-3">
        {backTo ? (
          <Link
            to={backTo.href}
            className="flex items-center gap-1 text-sm text-gray-400 transition hover:text-purple-300"
          >
            <ChevronLeft size={16} />
            {backTo.label}
          </Link>
        ) : (
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-600 text-xs font-bold text-white select-none">
              MT
            </div>
            <span className="text-lg font-bold text-purple-400">Manga Translator</span>
          </Link>
        )}
      </div>
    </header>
  );
}
