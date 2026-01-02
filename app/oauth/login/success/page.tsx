// app/oauth/login/success/page.tsx
import { cookies } from "next/headers";
import Link from "next/link";

export default async function LoginSuccessPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("user_session")?.value;
  
  let userName = "there";
  if (sessionCookie) {
    try {
      const session = JSON.parse(sessionCookie);
      userName = session.name?.split(" ")[0] || session.email.split("@")[0];
    } catch {
      // Ignore
    }
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        {/* Success Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 mb-6">
          <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-3">Welcome, {userName}!</h1>
        <p className="text-slate-400 mb-8">
          You&apos;ve successfully signed in to Meeting Intelligence.
        </p>
        
        {/* Next Steps Card */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6 mb-6 text-left">
          <h2 className="text-white font-semibold mb-4">Next Steps</h2>
          
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-blue-400 text-sm font-medium">1</span>
              </div>
              <div>
                <p className="text-white font-medium">Connect your platforms</p>
                <p className="text-slate-400 text-sm">Link Zoom and Asana to access your meetings and create tasks.</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-blue-400 text-sm font-medium">2</span>
              </div>
              <div>
                <p className="text-white font-medium">Return to ChatGPT</p>
                <p className="text-slate-400 text-sm">Use Meeting Intelligence directly in ChatGPT to access your meetings.</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Actions */}
        <div className="space-y-3">
          <Link
            href="/settings"
            className="block w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium hover:from-blue-600 hover:to-purple-700 transition-all"
          >
            Connect Platforms
          </Link>
          
          <p className="text-slate-500 text-sm">
            You can close this window and return to ChatGPT.
          </p>
        </div>
      </div>
    </div>
  );
}

