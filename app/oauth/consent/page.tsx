// app/oauth/consent/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { oauthUserConsents, oauthAuthorizationCodes } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { generateAuthorizationCode, getAuthCodeExpiry } from "@/lib/auth/jwt";

// Scope descriptions for display
const SCOPE_INFO: Record<string, { name: string; description: string; icon: string }> = {
  openid: {
    name: "Basic Profile",
    description: "Access your user ID",
    icon: "user",
  },
  profile: {
    name: "Profile Information",
    description: "Access your name and profile picture",
    icon: "user",
  },
  email: {
    name: "Email Address",
    description: "Access your email address",
    icon: "mail",
  },
  "meetings:read": {
    name: "View Meetings",
    description: "List and view your meeting recordings and transcripts",
    icon: "video",
  },
  "meetings:summary": {
    name: "Generate Summaries",
    description: "Create AI summaries of your meetings",
    icon: "document",
  },
  "tasks:write": {
    name: "Create Tasks",
    description: "Create tasks in your connected task manager",
    icon: "check",
  },
  "email:draft": {
    name: "Draft Emails",
    description: "Draft follow-up emails from meeting summaries",
    icon: "mail",
  },
};

export default async function ConsentPage() {
  const cookieStore = await cookies();
  
  // Get session
  const sessionCookie = cookieStore.get("user_session")?.value;
  if (!sessionCookie) {
    redirect("/oauth/login");
  }
  
  const session = JSON.parse(sessionCookie);
  
  // Get auth request
  const authRequestCookie = cookieStore.get("oauth_auth_request")?.value;
  if (!authRequestCookie) {
    redirect("/oauth/login?error=missing_auth_request");
  }
  
  const authRequest = JSON.parse(authRequestCookie);
  const requestedScopes = authRequest.scope.split(" ").filter((s: string) => s.length > 0);
  
  // Check if user already consented to these scopes
  const [existingConsent] = await db
    .select()
    .from(oauthUserConsents)
    .where(
      and(
        eq(oauthUserConsents.userId, session.userId),
        eq(oauthUserConsents.clientId, authRequest.clientId),
        isNull(oauthUserConsents.revokedAt)
      )
    )
    .limit(1);
  
  // If already consented to all scopes, auto-approve
  if (existingConsent) {
    const consentedScopes = existingConsent.scope.split(" ");
    const allScopesConsented = requestedScopes.every((s: string) => consentedScopes.includes(s));
    
    if (allScopesConsented) {
      // Generate auth code and redirect
      await autoApprove(session.userId, authRequest, cookieStore);
      // redirect() throws, so this line is never reached
      return null;
    }
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Authorize Access</h1>
          <p className="text-slate-400">
            <span className="font-medium text-white">{authRequest.clientName}</span> wants to access your Meeting Intelligence account
          </p>
        </div>
        
        {/* User Info */}
        <div className="bg-slate-800/30 rounded-xl p-4 mb-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium">
            {session.name?.[0]?.toUpperCase() || session.email[0].toUpperCase()}
          </div>
          <div>
            <p className="text-white font-medium">{session.name || "User"}</p>
            <p className="text-slate-400 text-sm">{session.email}</p>
          </div>
        </div>
        
        {/* Consent Card */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <h2 className="text-white font-semibold mb-4">This will allow {authRequest.clientName} to:</h2>
          
          {/* Scopes List */}
          <ul className="space-y-3 mb-6">
            {requestedScopes.map((scope: string) => {
              const info = SCOPE_INFO[scope];
              if (!info) return null;
              
              return (
                <li key={scope} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                    <ScopeIcon icon={info.icon} />
                  </div>
                  <div>
                    <p className="text-white font-medium">{info.name}</p>
                    <p className="text-slate-400 text-sm">{info.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          
          {/* Actions */}
          <form action={handleConsent} className="space-y-3">
            <input type="hidden" name="action" value="approve" />
            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium hover:from-blue-600 hover:to-purple-700 transition-all"
            >
              Allow Access
            </button>
          </form>
          
          <form action={handleConsent}>
            <input type="hidden" name="action" value="deny" />
            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-slate-700/50 text-slate-300 font-medium hover:bg-slate-700 transition-colors mt-3"
            >
              Deny
            </button>
          </form>
        </div>
        
        {/* Footer */}
        <p className="text-center text-slate-500 text-sm mt-6">
          You can revoke this access at any time from your account settings.
        </p>
      </div>
    </div>
  );
}

// Server action to handle consent
async function handleConsent(formData: FormData) {
  "use server";
  
  const action = formData.get("action") as string;
  const cookieStore = await cookies();
  
  const sessionCookie = cookieStore.get("user_session")?.value;
  const authRequestCookie = cookieStore.get("oauth_auth_request")?.value;
  
  if (!sessionCookie || !authRequestCookie) {
    redirect("/oauth/login?error=session_expired");
  }
  
  const session = JSON.parse(sessionCookie);
  const authRequest = JSON.parse(authRequestCookie);
  
  if (action === "deny") {
    // Clear auth request and redirect with error
    cookieStore.delete("oauth_auth_request");
    
    const redirectUrl = new URL(authRequest.redirectUri);
    redirectUrl.searchParams.set("error", "access_denied");
    redirectUrl.searchParams.set("error_description", "User denied the authorization request");
    if (authRequest.state) {
      redirectUrl.searchParams.set("state", authRequest.state);
    }
    
    redirect(redirectUrl.toString());
  }
  
  // Record consent
  await db
    .insert(oauthUserConsents)
    .values({
      userId: session.userId,
      clientId: authRequest.clientId,
      scope: authRequest.scope,
    })
    .onConflictDoUpdate({
      target: [oauthUserConsents.userId, oauthUserConsents.clientId],
      set: {
        scope: authRequest.scope,
        consentedAt: new Date(),
        revokedAt: null,
      },
    });
  
  // Generate authorization code
  const authCode = generateAuthorizationCode();
  const expiresAt = getAuthCodeExpiry();
  
  await db.insert(oauthAuthorizationCodes).values({
    code: authCode,
    clientId: authRequest.clientId,
    userId: session.userId,
    redirectUri: authRequest.redirectUri,
    scope: authRequest.scope,
    codeChallenge: authRequest.codeChallenge,
    codeChallengeMethod: authRequest.codeChallengeMethod,
    nonce: authRequest.nonce,
    state: authRequest.state,
    expiresAt,
  });
  
  // Clear auth request cookie
  cookieStore.delete("oauth_auth_request");
  
  // Redirect back to client
  const redirectUrl = new URL(authRequest.redirectUri);
  redirectUrl.searchParams.set("code", authCode);
  if (authRequest.state) {
    redirectUrl.searchParams.set("state", authRequest.state);
  }
  
  redirect(redirectUrl.toString());
}

// Auto-approve for returning users
async function autoApprove(
  userId: string,
  authRequest: {
    clientId: string;
    redirectUri: string;
    scope: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    nonce?: string;
    state?: string;
  },
  cookieStore: Awaited<ReturnType<typeof cookies>>
): Promise<never> {
  const authCode = generateAuthorizationCode();
  const expiresAt = getAuthCodeExpiry();
  
  await db.insert(oauthAuthorizationCodes).values({
    code: authCode,
    clientId: authRequest.clientId,
    userId: userId,
    redirectUri: authRequest.redirectUri,
    scope: authRequest.scope,
    codeChallenge: authRequest.codeChallenge,
    codeChallengeMethod: authRequest.codeChallengeMethod,
    nonce: authRequest.nonce,
    state: authRequest.state,
    expiresAt,
  });
  
  cookieStore.delete("oauth_auth_request");
  
  const redirectUrl = new URL(authRequest.redirectUri);
  redirectUrl.searchParams.set("code", authCode);
  if (authRequest.state) {
    redirectUrl.searchParams.set("state", authRequest.state);
  }
  
  redirect(redirectUrl.toString());
}

// Scope icon component
function ScopeIcon({ icon }: { icon: string }) {
  const iconClass = "w-4 h-4 text-slate-400";
  
  switch (icon) {
    case "user":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case "mail":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case "video":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case "document":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "check":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
    default:
      return null;
  }
}

