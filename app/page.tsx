'use client';

import { AuthGuard } from '@/components/auth';
import { AppShell } from '@/components/layout/app-shell';

export default function Home() {
  return (
    <AuthGuard>
      <AppShell />
    </AuthGuard>
  );
}
