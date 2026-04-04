import { useState } from 'react';
import { Header } from './Header';
import { RightSidebar } from './RightSidebar';

interface MainLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

export function MainLayout({ children, showSidebar = true }: MainLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Header onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} mobileMenuOpen={mobileMenuOpen} />
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex gap-8">
          <main className="flex-1 min-w-0">{children}</main>
          {showSidebar && <RightSidebar />}
        </div>
      </div>
    </div>
  );
}
