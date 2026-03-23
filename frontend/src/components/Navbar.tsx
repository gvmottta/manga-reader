import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

interface NavbarProps {
  backTo?: { href: string; label: string };
}

export default function Navbar({ backTo }: NavbarProps) {
  return (
    <header className="sticky top-0 z-50">
      {/* Safe-area bridge — fills the notch/Dynamic Island zone with a matching bg */}
      <div
        className="bg-gray-950/80 backdrop-blur-xl"
        style={{ height: "var(--safe-top)" }}
      />

      {/* Island connector — subtle pill accent that visually ties into the Dynamic Island */}
      <div className="relative flex justify-center bg-gray-950/80 backdrop-blur-xl">
        <div className="absolute -top-1 h-2 w-28 rounded-full bg-purple-500/20 blur-md" />
      </div>

      {/* Main navbar content */}
      <div className="relative border-b border-white/[0.06] bg-gray-950/70 backdrop-blur-xl">
        {/* Top edge highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />

        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            {backTo ? (
              <Link
                to={backTo.href}
                className="group flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm text-gray-400 transition hover:border-purple-500/40 hover:bg-purple-500/10 hover:text-purple-300"
              >
                <ChevronLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
                {backTo.label}
              </Link>
            ) : (
              <Link to="/" className="group flex items-center gap-2.5">
                <img
                  src="/logo.png"
                  alt="Manga Reader logo"
                  className="h-8 w-8 rounded-lg object-contain shadow-lg shadow-purple-500/25 transition-shadow group-hover:shadow-purple-500/40"
                />
                <span className="bg-gradient-to-r from-purple-300 to-purple-500 bg-clip-text text-lg font-bold text-transparent">
                  Mangás pra Minha Gata
                </span>
              </Link>
            )}
          </div>
        </div>

        {/* Bottom fade — softens the border into the content below */}
        <div className="absolute inset-x-0 -bottom-4 h-4 bg-gradient-to-b from-gray-950/40 to-transparent pointer-events-none" />
      </div>
    </header>
  );
}
