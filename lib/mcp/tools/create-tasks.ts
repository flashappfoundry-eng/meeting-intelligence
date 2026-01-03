// lib/mcp/tools/create-tasks.ts
/**
 * Tool: createTasks
 * 
 * Creates tasks in Asana from meeting action items.
 * Can create multiple tasks at once with optional due dates, assignees, and priorities.
 */

import { type AuthenticatedUser } from "@/lib/auth/mcp-auth";
import { getUserTokens, refreshTokenIfNeeded } from "@/lib/auth/tokens";
import { 
  createAsanaClient, 
  type AsanaTaskInput,
  type AsanaWorkspace,
  type AsanaProject,
} from "@/lib/integrations/asana";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";

// Action item type from getActionItems tool
interface ActionItem {
  task: string;
  assignee?: string;
  dueDate?: string;
  priority?: "high" | "medium" | "low";
  context?: string;
}

export async function handleCreateTasks(
  user: AuthenticatedUser,
  args: Record<string, unknown>
) {
  // Parse arguments
  const actionItems = args.actionItems as ActionItem[] | undefined;
  const projectId = args.projectId as string | undefined;
  const workspaceId = args.workspaceId as string | undefined;
  const platform = (args.platform as string) || "asana";
  
  console.log("[createTasks] ====== START ======");
  console.log("[createTasks] User:", user.id, user.email);
  console.log("[createTasks] Platform:", platform);
  console.log("[createTasks] Action items count:", actionItems?.length || 0);
  console.log("[createTasks] Project ID:", projectId || "(default)");
  console.log("[createTasks] Workspace ID:", workspaceId || "(default)");
  
  // Validate input
  if (!actionItems || actionItems.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No action items provided to create tasks from.\n\n" +
            "**How to use:**\n" +
            "1. First use `getActionItems` or `pasteTranscript` to extract action items from a meeting\n" +
            "2. Then call `createTasks` with the extracted action items\n\n" +
            "**Example:**\n" +
            "```\n" +
            "createTasks({\n" +
            '  actionItems: [\n' +
            '    { task: "Send proposal", assignee: "John", dueDate: "2026-01-15" }\n' +
            '  ]\n' +
            "})\n" +
            "```",
        },
      ],
    };
  }
  
  // Currently only Asana is supported
  if (platform !== "asana") {
    return {
      content: [
        {
          type: "text",
          text: `Platform "${platform}" is not yet supported. Currently only Asana integration is available.\n\n` +
            "Supported platforms:\n" +
            "• **asana** - Create tasks in Asana ✅\n" +
            "• jira - Coming soon\n" +
            "• notion - Coming soon",
        },
      ],
    };
  }
  
  // Get Asana tokens
  let tokens = await getUserTokens(user.id, "asana");
  
  if (!tokens) {
    console.log("[createTasks] No Asana tokens - user needs to connect");
    return {
      content: [
        {
          type: "text",
          text: `You haven't connected your Asana account yet. Please connect it to create tasks.\n\n` +
            `Connect here: ${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=asana`,
        },
      ],
      _meta: {
        widget: {
          type: "connection-status",
          url: `${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=asana`,
        },
      },
    };
  }
  
  try {
    // Refresh token if needed
    tokens = await refreshTokenIfNeeded(user.id, "asana", tokens);
    
    const asana = createAsanaClient(tokens.accessToken);
    
    // Verify token works
    console.log("[createTasks] Verifying Asana connection...");
    const asanaUser = await asana.getMe();
    console.log("[createTasks] Asana user:", asanaUser.email || asanaUser.gid);
    
    // Get workspace
    let targetWorkspace: AsanaWorkspace | null = null;
    
    if (workspaceId) {
      // Use provided workspace
      const workspaces = await asana.getWorkspaces();
      targetWorkspace = workspaces.find(w => w.gid === workspaceId) || null;
      
      if (!targetWorkspace) {
        return {
          content: [
            {
              type: "text",
              text: `Workspace "${workspaceId}" not found. Use getConnectionStatus to see available workspaces.`,
            },
          ],
        };
      }
    } else {
      // Use default workspace
      targetWorkspace = await asana.getDefaultWorkspace();
      
      if (!targetWorkspace) {
        return {
          content: [
            {
              type: "text",
              text: "No Asana workspaces found. Please create a workspace in Asana first, then reconnect your account.",
            },
          ],
        };
      }
    }
    
    console.log("[createTasks] Using workspace:", targetWorkspace.name);
    
    // Get project if specified or use default
    let targetProject: AsanaProject | null = null;
    
    if (projectId) {
      const projects = await asana.getProjects(targetWorkspace.gid);
      targetProject = projects.find(p => p.gid === projectId) || null;
      
      if (!targetProject) {
        console.log("[createTasks] Project not found, will create tasks without project");
      }
    } else {
      // Try to get default project
      targetProject = await asana.getDefaultProject(targetWorkspace.gid);
    }
    
    if (targetProject) {
      console.log("[createTasks] Using project:", targetProject.name);
    } else {
      console.log("[createTasks] No project specified, creating tasks in workspace only");
    }
    
    // Convert action items to Asana tasks
    const asanaTasks: AsanaTaskInput[] = actionItems.map(item => {
      // Add priority emoji to task name
      const priorityPrefix = item.priority === "high" ? "🔴 " : 
                            item.priority === "medium" ? "🟡 " : 
                            item.priority === "low" ? "🟢 " : "";
      
      const taskInput: AsanaTaskInput = {
        name: `${priorityPrefix}${item.task}`,
        workspace: targetWorkspace!.gid,
      };
      
      // Add notes with context
      if (item.context || item.assignee) {
        const notes: string[] = [];
        if (item.context) {
          notes.push(`Context: ${item.context}`);
        }
        if (item.assignee) {
          notes.push(`Originally assigned to: ${item.assignee}`);
        }
        notes.push(`\nCreated from Meeting Intelligence`);
        taskInput.notes = notes.join("\n");
      }
      
      // Add due date if valid
      if (item.dueDate && isValidDate(item.dueDate)) {
        taskInput.due_on = item.dueDate;
      }
      
      // Add to project if available
      if (targetProject) {
        taskInput.projects = [targetProject.gid];
      }
      
      return taskInput;
    });
    
    // Create tasks
    console.log("[createTasks] Creating", asanaTasks.length, "tasks...");
    const results = await asana.createTasks(asanaTasks);
    
    // Count successes and failures
    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log("[createTasks] Created", succeeded.length, "/", results.length, "tasks");
    console.log("[createTasks] ====== COMPLETE ======");
    
    // Format response
    let responseText = "";
    
    if (succeeded.length > 0) {
      responseText += `✅ **Created ${succeeded.length} task${succeeded.length !== 1 ? "s" : ""} in Asana**\n\n`;
      responseText += `**Workspace:** ${targetWorkspace.name}\n`;
      if (targetProject) {
        responseText += `**Project:** ${targetProject.name}\n`;
      }
      responseText += "\n";
      
      responseText += "**Tasks created:**\n";
      succeeded.forEach((result, index) => {
        const task = result.task!;
        const url = task.permalink_url || `https://app.asana.com/0/0/${task.gid}`;
        responseText += `${index + 1}. [${task.name}](${url})`;
        if (task.due_on) {
          responseText += ` 📅 ${task.due_on}`;
        }
        responseText += "\n";
      });
    }
    
    if (failed.length > 0) {
      if (responseText) responseText += "\n---\n\n";
      responseText += `⚠️ **${failed.length} task${failed.length !== 1 ? "s" : ""} failed to create:**\n`;
      failed.forEach((result, index) => {
        const originalItem = actionItems[results.indexOf(result)];
        responseText += `${index + 1}. "${originalItem?.task || "Unknown"}" - ${result.error}\n`;
      });
    }
    
    if (succeeded.length === 0) {
      responseText = `❌ **Failed to create tasks**\n\n`;
      responseText += "All task creations failed. Please check your Asana connection and try again.\n\n";
      responseText += `Reconnect Asana: ${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=asana`;
    }
    
    return {
      content: [
        {
          type: "text",
          text: responseText,
        },
      ],
      _meta: {
        workspace: {
          gid: targetWorkspace.gid,
          name: targetWorkspace.name,
        },
        project: targetProject ? {
          gid: targetProject.gid,
          name: targetProject.name,
        } : null,
        results: results.map((r, i) => ({
          success: r.success,
          taskName: actionItems[i]?.task || "Unknown",
          taskGid: r.task?.gid,
          taskUrl: r.task?.permalink_url || (r.task?.gid ? `https://app.asana.com/0/0/${r.task.gid}` : null),
          error: r.error,
        })),
        summary: {
          total: results.length,
          succeeded: succeeded.length,
          failed: failed.length,
        },
      },
    };
    
  } catch (error) {
    console.error("[createTasks] Error:", error);
    
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = (error as Error & { status?: number }).status;
    
    // Handle auth errors
    if (status === 401 || message.includes("401") || message.includes("unauthorized")) {
      return {
        content: [
          {
            type: "text",
            text: `Your Asana connection has expired. Please reconnect your account.\n\n` +
              `Reconnect here: ${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=asana`,
          },
        ],
        _meta: {
          widget: {
            type: "connection-status",
            url: `${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=asana`,
          },
        },
      };
    }
    
    // Handle permission errors
    if (status === 403 || message.includes("403") || message.includes("permission")) {
      return {
        content: [
          {
            type: "text",
            text: `You don't have permission to create tasks in this workspace/project.\n\n` +
              "Please check your Asana permissions or try a different workspace.",
          },
        ],
      };
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Error creating tasks: ${message}\n\n` +
            "Please try again. If the issue persists, try reconnecting your Asana account.",
        },
      ],
    };
  }
}

/**
 * Validate date string is in YYYY-MM-DD format
 */
function isValidDate(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) {
    return false;
  }
  
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}
