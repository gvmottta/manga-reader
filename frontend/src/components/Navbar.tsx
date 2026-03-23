import { Link } from "react-router-dom";
import { ChevronLeft, Sun, Moon } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

interface NavbarProps {
  backTo?: { href: string; label: string };
}

export default function Navbar({ backTo }: NavbarProps) {
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-50">
      {/* Safe-area bridge — fills the notch/Dynamic Island zone with a matching bg */}
      <div
        className="bg-bg/80 backdrop-blur-xl"
        style={{ height: "var(--safe-top)" }}
      />

      {/* Island connector — subtle pill accent that visually ties into the Dynamic Island */}
      <div className="relative flex justify-center bg-bg/80 backdrop-blur-xl">
        <div className="absolute -top-1 h-2 w-28 rounded-full bg-secondary/20 blur-md" />
      </div>

      {/* Main navbar content */}
      <div className="relative border-b border-border/30 bg-bg/70 backdrop-blur-xl">
        {/* Top edge highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-secondary/30 to-transparent" />

        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            {backTo ? (
              <Link
                to={backTo.href}
                className="group flex items-center gap-1.5 rounded-full border border-border/40 bg-surface/40 px-3 py-1.5 text-sm text-muted transition hover:border-secondary/40 hover:bg-secondary/10 hover:text-secondary"
              >
                <ChevronLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
                {backTo.label}
              </Link>
            ) : (
              <Link to="/" className="group flex items-center gap-2.5">
                <img
                  src="/logo.png"
                  alt="Manga Reader logo"
                  className="h-8 w-8 rounded-lg object-contain"
                />
                <span className="bg-gradient-to-r from-secondary to-primary bg-clip-text text-lg font-bold text-transparent">
                  Mangás pra Minha Gata
                </span>
              </Link>
            )}

            <button
              onClick={toggle}
              aria-label="Alternar tema"
              className="ml-auto rounded-full border border-border bg-surface p-2 text-muted transition hover:border-primary/40 hover:text-primary"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>

        {/* Bottom fade — softens the border into the content below */}
        <div className="absolute inset-x-0 -bottom-4 h-4 bg-gradient-to-b from-bg/40 to-transparent pointer-events-none" />
      </div>
    </header>
  );
}
