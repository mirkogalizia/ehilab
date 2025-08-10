'use client';
import { PropsWithChildren, useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

export default function AppShell({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Topbar */}
      <header className="h-14 border-b flex items-center px-4 gap-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[260px]">
            <Sidebar onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="font-semibold">ChatBoost</div>
        <div className="ml-auto">{/* Right actions */}</div>
      </header>

      <div className="flex">
        {/* Sidebar desktop */}
        <aside className="hidden md:block w-[260px] border-r">
          <Sidebar />
        </aside>

        {/* Content */}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const items = [
    { href: '/chatboost', label: 'Chat' },
    { href: '/chatboost/templates', label: 'Template' },
    { href: '/chatboost/contacts', label: 'Contatti' },
    { href: '/chatboost/settings', label: 'Impostazioni' },
  ];
  return (
    <nav className="h-full p-3">
      <div className="px-3 py-2 text-sm text-muted-foreground">Menu</div>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.href}>
            <a
              href={it.href}
              onClick={onNavigate}
              className="block rounded-xl px-3 py-2 hover:bg-accent hover:text-accent-foreground"
            >
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}