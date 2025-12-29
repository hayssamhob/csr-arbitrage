/**
 * Footer - Shared footer component for all pages
 * Matches the subtle style from Alignment page
 */

export function Footer() {
  return (
    <footer className="text-center text-slate-600 text-xs py-12 border-t border-slate-900">
      <div className="flex items-center justify-center gap-3 mb-2">
        <img
          src="/depollute-logo-256.png"
          alt="CSR"
          className="h-6 w-6 grayscale opacity-20"
        />
        <span className="font-black tracking-widest uppercase opacity-30">
          Security Protocol Protected
        </span>
      </div>
      <p>© 2025 Depollute Now • All systems operational</p>
    </footer>
  );
}
