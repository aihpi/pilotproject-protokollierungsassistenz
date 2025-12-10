import type { LayoutProps } from '../types';

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-800">
            Sitzungsprotokoll Generator
          </h1>
          <div className="flex items-center gap-6">
            <img
              src="/logos/logo_bmftr_de.png"
              alt="BMFTR Logo"
              className="h-12 object-contain"
            />
            <img
              src="/logos/logo_aisc_150dpi.png"
              alt="AISC Logo"
              className="h-12 object-contain"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-6 py-8">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto text-center text-sm text-gray-500">
          Entwickelt am KI-Servicezentrum Berlin-Brandenburg
        </div>
      </footer>
    </div>
  );
}
