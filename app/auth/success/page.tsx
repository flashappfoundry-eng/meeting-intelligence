// app/auth/success/page.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const PLATFORM_NAMES: Record<string, string> = {
  zoom: "Zoom",
  asana: "Asana",
  teams: "Microsoft Teams",
  jira: "Jira",
  notion: "Notion",
};

export default function AuthSuccessPage() {
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform");
  const [countdown, setCountdown] = useState(3);
  
  const platformName = platform ? PLATFORM_NAMES[platform] || platform : "Platform";
  
  useEffect(() => {
    // Auto-close window after countdown
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timer);
          // Try to close window (works if opened via window.open)
          window.close();
        }
        return c - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="text-center">
        {/* Success Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 mb-6">
          <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-2">
          {platformName} Connected!
        </h1>
        
        <p className="text-slate-400 mb-6">
          Your {platformName} account has been successfully connected.
        </p>
        
        <p className="text-slate-500 text-sm">
          This window will close in {countdown} seconds...
        </p>
        
        <button
          onClick={() => window.close()}
          className="mt-4 px-6 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors"
        >
          Close Now
        </button>
      </div>
    </div>
  );
}
