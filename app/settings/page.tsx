// app/settings/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { users, platformConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import Link from "next/link";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("user_session")?.value;
  
  if (!sessionCookie) {
    redirect("/oauth/login");
  }
  
  const session = JSON.parse(sessionCookie);
  
  // Get user and connections
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  
  if (!user) {
    redirect("/oauth/login");
  }
  
  const connections = await db
    .select()
    .from(platformConnections)
    .where(
      and(
        eq(platformConnections.userId, user.id),
        eq(platformConnections.isActive, true)
      )
    );
  
  const connectedPlatforms = new Set(connections.map(c => c.platform));
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
          <p className="text-slate-400">Manage your account and connected platforms</p>
        </div>
        
        {/* User Info */}
        <div className="bg-slate-800/50 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Account</h2>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-2xl font-medium">
              {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
            </div>
            <div>
              <p className="text-white font-medium text-lg">{user.name || "User"}</p>
              <p className="text-slate-400">{user.email}</p>
            </div>
          </div>
        </div>
        
        {/* Meeting Platforms */}
        <div className="bg-slate-800/50 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Meeting Platforms</h2>
          <div className="space-y-3">
            <PlatformRow
              name="Zoom"
              icon="📹"
              platform="zoom"
              connected={connectedPlatforms.has("zoom")}
              email={connections.find(c => c.platform === "zoom")?.platformEmail}
              userId={user.id}
            />
            <PlatformRow
              name="Microsoft Teams"
              icon="👥"
              platform="teams"
              connected={connectedPlatforms.has("teams")}
              email={connections.find(c => c.platform === "teams")?.platformEmail}
              userId={user.id}
              comingSoon
            />
          </div>
        </div>
        
        {/* Task Platforms */}
        <div className="bg-slate-800/50 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Task Management</h2>
          <div className="space-y-3">
            <PlatformRow
              name="Asana"
              icon="✅"
              platform="asana"
              connected={connectedPlatforms.has("asana")}
              email={connections.find(c => c.platform === "asana")?.platformEmail}
              userId={user.id}
            />
            <PlatformRow
              name="Jira"
              icon="📋"
              platform="jira"
              connected={connectedPlatforms.has("jira")}
              email={connections.find(c => c.platform === "jira")?.platformEmail}
              userId={user.id}
              comingSoon
            />
          </div>
        </div>
        
        {/* Back to ChatGPT */}
        <div className="text-center text-slate-500 text-sm">
          <p>You can close this window and return to ChatGPT.</p>
        </div>
      </div>
    </div>
  );
}

function PlatformRow({
  name,
  icon,
  platform,
  connected,
  email,
  userId,
  comingSoon,
}: {
  name: string;
  icon: string;
  platform: string;
  connected: boolean;
  email?: string | null;
  userId: string;
  comingSoon?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-white font-medium">{name}</p>
          {connected && email && (
            <p className="text-green-400 text-sm">{email}</p>
          )}
          {connected && !email && (
            <p className="text-green-400 text-sm">Connected</p>
          )}
          {comingSoon && !connected && (
            <p className="text-slate-500 text-sm">Coming soon</p>
          )}
        </div>
      </div>
      
      {!comingSoon && (
        connected ? (
          <form action={`/api/connections/${platform}?userId=${userId}`} method="POST">
            <input type="hidden" name="_method" value="DELETE" />
            <button
              type="submit"
              className="px-4 py-2 text-sm rounded-lg border border-slate-600 text-slate-400 hover:text-red-400 hover:border-red-400 transition-colors"
            >
              Disconnect
            </button>
          </form>
        ) : (
          <Link
            href={`/api/auth/${platform}?userId=${userId}`}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            Connect
          </Link>
        )
      )}
    </div>
  );
}

