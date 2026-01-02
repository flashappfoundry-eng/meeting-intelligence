// app/auth/error/layout.tsx
import { Suspense } from "react";

export default function AuthErrorLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      {children}
    </Suspense>
  );
}

