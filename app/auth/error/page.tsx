// app/auth/error/page.tsx
"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

const PLATFORM_NAMES: Record<string, string> = {
  zoom: "Zoom",
  asana: "Asana", 
  teams: "Microsoft Teams",
  jira: "Jira",
  notion: "Notion",
};

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You denied access to the application.",
  missing_params: "Missing required parameters from the OAuth response.",
  exchange_failed: "Failed to complete the authentication process.",
  init_failed: "Failed to start the authentication process.",
  unsupported_platform: "This platform is not currently supported.",
  invalid_state: "Security validation failed. Please try again.",
  state_expired: "The authentication session has expired. Please try again.",
  missing_user: "User identification failed. Please try again.",
};

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform");
  const error = searchParams.get("error");
  const description = searchParams.get("description");
  
  const platformName = platform ? PLATFORM_NAMES[platform] || platform : "Platform";
  const errorMessage = error ? ERROR_MESSAGES[error] || error : "An unknown error occurred";
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {/* Error Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/20 mb-6">
          <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-2">
          Connection Failed
        </h1>
        
        <p className="text-slate-400 mb-4">
          Failed to connect {platformName}.
        </p>
        
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 text-left">
          <p className="text-red-400 text-sm font-medium mb-1">Error</p>
          <p className="text-red-300 text-sm">{errorMessage}</p>
          {description && (
            <p className="text-red-300/70 text-xs mt-2">{description}</p>
          )}
        </div>
        
        <div className="space-y-3">
          {platform && (
            <Link
              href={`/api/auth/${platform}`}
              className="block w-full px-6 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            >
              Try Again
            </Link>
          )}
          
          <button
            onClick={() => window.close()}
            className="block w-full px-6 py-3 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
