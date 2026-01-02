// app/widgets/connection-status/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface PlatformConnection {
  platform: string;
  platformCategory: string;
  platformEmail: string | null;
  platformDisplayName: string | null;
  isDefault: boolean;
  connectedAt: string;
}

interface ConnectionStatusData {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  connections: PlatformConnection[];
}

const PLATFORM_INFO: Record<string, { name: string; icon: string; category: string; color: string }> = {
  zoom: { name: "Zoom", icon: "📹", category: "meetings", color: "#2D8CFF" },
  teams: { name: "Microsoft Teams", icon: "👥", category: "meetings", color: "#6264A7" },
  meet: { name: "Google Meet", icon: "🎥", category: "meetings", color: "#00897B" },
  asana: { name: "Asana", icon: "✅", category: "tasks", color: "#F06A6A" },
  jira: { name: "Jira", icon: "📋", category: "tasks", color: "#0052CC" },
  notion: { name: "Notion", icon: "📝", category: "tasks", color: "#000000" },
  slack: { name: "Slack", icon: "💬", category: "communication", color: "#4A154B" },
  gmail: { name: "Gmail", icon: "📧", category: "email", color: "#EA4335" },
  outlook: { name: "Outlook", icon: "📬", category: "email", color: "#0078D4" },
};

const AVAILABLE_PLATFORMS = {
  meetings: ["zoom", "teams"],
  tasks: ["asana"],
};

export default function ConnectionStatusWidget() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const highlightPlatform = searchParams.get("platform");
  
  const [data, setData] = useState<ConnectionStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setError("Missing user ID");
      setLoading(false);
      return;
    }

    fetchConnectionStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const fetchConnectionStatus = async () => {
    try {
      const response = await fetch(`/api/connections?userId=${userId}`);
      if (!response.ok) throw new Error("Failed to fetch connections");
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = (platform: string) => {
    setConnecting(platform);
    // Open OAuth in new window
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const authWindow = window.open(
      `/api/auth/${platform}?userId=${userId}`,
      `Connect ${platform}`,
      `width=${width},height=${height},left=${left},top=${top}`
    );

    // Poll for window close
    const pollTimer = setInterval(() => {
      if (authWindow?.closed) {
        clearInterval(pollTimer);
        setConnecting(null);
        fetchConnectionStatus(); // Refresh status
      }
    }, 500);
  };

  const handleDisconnect = async (platform: string) => {
    if (!confirm(`Disconnect ${PLATFORM_INFO[platform]?.name || platform}?`)) return;
    
    try {
      const response = await fetch(`/api/connections/${platform}?userId=${userId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to disconnect");
      fetchConnectionStatus();
    } catch {
      alert("Failed to disconnect. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="widget-container">
        <div className="loading">
          <div className="spinner"></div>
          <span>Loading connections...</span>
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="widget-container">
        <div className="error">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  return (
    <div className="widget-container" data-llm="connection-status-widget">
      {/* Header */}
      <div className="header">
        <h2>Connected Accounts</h2>
        <p className="subtitle">{data?.user.email}</p>
      </div>

      {/* Meeting Platforms */}
      <div className="section">
        <h3 className="section-title">
          <span className="section-icon">📹</span>
          Meeting Platforms
        </h3>
        <div className="platforms">
          {AVAILABLE_PLATFORMS.meetings.map(platform => {
            const info = PLATFORM_INFO[platform];
            const connection = data?.connections.find(c => c.platform === platform);
            const isHighlighted = highlightPlatform === platform && !connection;
            
            return (
              <div 
                key={platform} 
                className={`platform-card ${connection ? "connected" : ""} ${isHighlighted ? "highlighted" : ""}`}
                data-llm={`platform-${platform}-${connection ? "connected" : "disconnected"}`}
              >
                <div className="platform-info">
                  <span className="platform-icon">{info.icon}</span>
                  <div className="platform-details">
                    <span className="platform-name">{info.name}</span>
                    {connection && (
                      <span className="platform-email">{connection.platformEmail || "Connected"}</span>
                    )}
                  </div>
                </div>
                <div className="platform-actions">
                  {connection ? (
                    <button 
                      className="btn btn-disconnect"
                      onClick={() => handleDisconnect(platform)}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button 
                      className={`btn btn-connect ${isHighlighted ? "pulse" : ""}`}
                      onClick={() => handleConnect(platform)}
                      disabled={connecting === platform}
                    >
                      {connecting === platform ? "Connecting..." : "Connect"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task Platforms */}
      <div className="section">
        <h3 className="section-title">
          <span className="section-icon">✅</span>
          Task Management
        </h3>
        <div className="platforms">
          {AVAILABLE_PLATFORMS.tasks.map(platform => {
            const info = PLATFORM_INFO[platform];
            const connection = data?.connections.find(c => c.platform === platform);
            const isHighlighted = highlightPlatform === platform && !connection;
            
            return (
              <div 
                key={platform} 
                className={`platform-card ${connection ? "connected" : ""} ${isHighlighted ? "highlighted" : ""}`}
                data-llm={`platform-${platform}-${connection ? "connected" : "disconnected"}`}
              >
                <div className="platform-info">
                  <span className="platform-icon">{info.icon}</span>
                  <div className="platform-details">
                    <span className="platform-name">{info.name}</span>
                    {connection && (
                      <span className="platform-email">{connection.platformEmail || "Connected"}</span>
                    )}
                  </div>
                </div>
                <div className="platform-actions">
                  {connection ? (
                    <button 
                      className="btn btn-disconnect"
                      onClick={() => handleDisconnect(platform)}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button 
                      className={`btn btn-connect ${isHighlighted ? "pulse" : ""}`}
                      onClick={() => handleConnect(platform)}
                      disabled={connecting === platform}
                    >
                      {connecting === platform ? "Connecting..." : "Connect"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Help Text */}
      <div className="help-text">
        <p>Connect your accounts to access meetings and create tasks directly from ChatGPT.</p>
      </div>

      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  .widget-container {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1a2e;
    color: #ffffff;
    padding: 20px;
    border-radius: 12px;
    max-width: 400px;
    margin: 0 auto;
  }

  .loading, .error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px 20px;
    color: #a0a0a0;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #333;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error {
    color: #f87171;
  }

  .error-icon {
    font-size: 20px;
  }

  .header {
    margin-bottom: 24px;
  }

  .header h2 {
    margin: 0 0 4px 0;
    font-size: 18px;
    font-weight: 600;
  }

  .subtitle {
    margin: 0;
    font-size: 13px;
    color: #888;
  }

  .section {
    margin-bottom: 20px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 500;
    color: #a0a0a0;
  }

  .section-icon {
    font-size: 16px;
  }

  .platforms {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .platform-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    background: #252540;
    border-radius: 8px;
    border: 1px solid #333;
    transition: all 0.2s ease;
  }

  .platform-card.connected {
    border-color: #22c55e40;
    background: #22c55e10;
  }

  .platform-card.highlighted {
    border-color: #6366f1;
    background: #6366f120;
    animation: highlight-pulse 2s ease-in-out infinite;
  }

  @keyframes highlight-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
    50% { box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
  }

  .platform-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .platform-icon {
    font-size: 24px;
  }

  .platform-details {
    display: flex;
    flex-direction: column;
  }

  .platform-name {
    font-size: 14px;
    font-weight: 500;
  }

  .platform-email {
    font-size: 12px;
    color: #22c55e;
  }

  .platform-actions {
    flex-shrink: 0;
  }

  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-connect {
    background: #6366f1;
    color: white;
  }

  .btn-connect:hover:not(:disabled) {
    background: #5558e3;
  }

  .btn-connect.pulse {
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }

  .btn-disconnect {
    background: transparent;
    color: #888;
    border: 1px solid #444;
  }

  .btn-disconnect:hover {
    background: #f8717120;
    border-color: #f87171;
    color: #f87171;
  }

  .help-text {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #333;
  }

  .help-text p {
    margin: 0;
    font-size: 12px;
    color: #666;
    text-align: center;
  }
`;

