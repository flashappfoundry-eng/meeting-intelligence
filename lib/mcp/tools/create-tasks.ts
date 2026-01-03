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
  type EnhancedTaskInput,
  type AsanaWorkspace,
  type AsanaProject,
} from "@/lib/integrations/asana";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";

// Action item type - supports both "title" (from schema) and "task" (legacy)
interface ActionItem {
  title?: string;  // Schema field name
  task?: string;   // Legacy/alternative field name
  name?: string;   // Another alternative
  assignee?: string;
  dueDate?: string;
  priority?: "high" | "medium" | "low";
  context?: string;
  notes?: string;
}

// Helper to get task name from various possible field names
function getTaskName(item: ActionItem): string {
  return item.title || item.task || item.name || "Untitled Task";
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
  console.log("[createTasks] Input received:", JSON.stringify(args, null, 2));
  console.log("[createTasks] First action item:", actionItems?.[0]);
  
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
            '    { title: "Send proposal", assignee: "John", dueDate: "2026-01-15" }\n' +
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
    
    // Convert action items to enhanced Asana tasks (with assignee resolution & priority tags)
    console.log("[createTasks] ====== CONVERTING ACTION ITEMS ======");
    
    const enhancedTasks: EnhancedTaskInput[] = actionItems.map((item, index) => {
      // Get task name from any available field
      const taskName = getTaskName(item);
      
      console.log(`[createTasks] Processing item ${index + 1}:`, { 
        title: item.title, 
        task: item.task, 
        name: item.name,
        assignee: item.assignee,
        dueDate: item.dueDate,
        priority: item.priority,
        context: item.context,
        resolved: taskName 
      });
      
      // Explicit priority logging
      if (item.priority) {
        console.log(`[createTasks] ✓ Item ${index + 1} has priority: "${item.priority}"`);
      } else {
        console.log(`[createTasks] ⚠️ Item ${index + 1} has NO PRIORITY SET - will default to medium`);
      }
      
      // Convert relative date to ISO format
      const convertedDueDate = convertRelativeDateToISO(item.dueDate);
      console.log(`[createTasks] Due date conversion: "${item.dueDate}" → "${convertedDueDate}"`);
      
      const taskInput: EnhancedTaskInput = {
        name: taskName,
        workspaceGid: targetWorkspace!.gid,
        projectGid: targetProject?.gid || targetWorkspace!.gid,
        assigneeName: item.assignee || null,
        priority: item.priority,
        due_on: convertedDueDate || undefined,
      };
      
      // Add notes with context
      const notesContent = item.notes || item.context;
      if (notesContent) {
        const notes: string[] = [];
        notes.push(`Context: ${notesContent}`);
        notes.push(`\nCreated from Meeting Intelligence`);
        taskInput.notes = notes.join("\n");
      } else {
        taskInput.notes = "Created from Meeting Intelligence";
      }
      
      console.log(`[createTasks] Final task input ${index + 1}:`, {
        name: taskInput.name,
        assigneeName: taskInput.assigneeName,
        priority: taskInput.priority,
        due_on: taskInput.due_on,
        workspaceGid: taskInput.workspaceGid,
        projectGid: taskInput.projectGid,
      });
      
      return taskInput;
    });
    
    // Create tasks with enhanced features (assignee resolution + priority tags)
    console.log("[createTasks] ====== CALLING createEnhancedTasks ======");
    console.log("[createTasks] Task count:", enhancedTasks.length);
    console.log("[createTasks] Tasks to create:", JSON.stringify(enhancedTasks.map(t => ({
      name: t.name,
      assigneeName: t.assigneeName,
      priority: t.priority,
      due_on: t.due_on,
    })), null, 2));
    
    const results = await asana.createEnhancedTasks(enhancedTasks);
    
    console.log("[createTasks] ====== RESULTS ======");
    console.log("[createTasks] Results:", JSON.stringify(results.map(r => ({
      success: r.success,
      taskGid: r.task?.gid,
      taskName: r.task?.name,
      assignee: r.task?.assignee,
      error: r.error,
    })), null, 2));
    
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
        const originalItem = actionItems[results.indexOf(result)];
        const url = task.permalink_url || `https://app.asana.com/0/0/${task.gid}`;
        
        // Priority indicator
        const priorityIcon = originalItem?.priority === "high" ? "🔴" : 
                            originalItem?.priority === "low" ? "🟢" : "🟡";
        
        responseText += `${index + 1}. ${priorityIcon} [${task.name}](${url})`;
        
        // Show assignee if resolved
        if (task.assignee?.name) {
          responseText += ` 👤 ${task.assignee.name}`;
        } else if (originalItem?.assignee) {
          responseText += ` _(assignee "${originalItem.assignee}" not found in workspace)_`;
        }
        
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
        const taskName = originalItem ? getTaskName(originalItem) : "Unknown";
        responseText += `${index + 1}. "${taskName}" - ${result.error}\n`;
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
          taskName: actionItems[i] ? getTaskName(actionItems[i]) : "Unknown",
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
 * Convert relative date strings to ISO format (YYYY-MM-DD)
 * Handles: "today", "tomorrow", "Friday", "next week", "end of day", etc.
 */
function convertRelativeDateToISO(relativeDate: string | null | undefined): string | null {
  if (!relativeDate) return null;
  
  const today = new Date();
  const lowerDate = relativeDate.toLowerCase().trim();
  
  console.log(`[DATE_CONVERT] Converting: "${relativeDate}"`);
  
  // Handle ISO dates (already formatted)
  if (/^\d{4}-\d{2}-\d{2}$/.test(relativeDate)) {
    console.log(`[DATE_CONVERT] Already ISO format: ${relativeDate}`);
    return relativeDate;
  }
  
  // Handle "today" or "end of day" or "EOD"
  if (lowerDate === 'today' || lowerDate.includes('end of day') || lowerDate === 'eod') {
    const result = today.toISOString().split('T')[0];
    console.log(`[DATE_CONVERT] "today/EOD" → ${result}`);
    return result;
  }
  
  // Handle "tomorrow"
  if (lowerDate === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const result = tomorrow.toISOString().split('T')[0];
    console.log(`[DATE_CONVERT] "tomorrow" → ${result}`);
    return result;
  }
  
  // Handle day names (Monday, Tuesday, etc.)
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = days.findIndex(d => lowerDate.includes(d));
  if (dayIndex !== -1) {
    const currentDay = today.getDay();
    let daysUntil = dayIndex - currentDay;
    if (daysUntil <= 0) daysUntil += 7; // Next week if day has passed
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntil);
    const result = targetDate.toISOString().split('T')[0];
    console.log(`[DATE_CONVERT] "${days[dayIndex]}" → ${result} (in ${daysUntil} days)`);
    return result;
  }
  
  // Handle "end of week" / "this week"
  if (lowerDate.includes('end of week') || lowerDate === 'this week') {
    const friday = new Date(today);
    const currentDay = today.getDay();
    const daysUntilFriday = currentDay <= 5 ? (5 - currentDay) : (5 + 7 - currentDay);
    friday.setDate(today.getDate() + daysUntilFriday);
    const result = friday.toISOString().split('T')[0];
    console.log(`[DATE_CONVERT] "end of week" → ${result}`);
    return result;
  }
  
  // Handle "next week"
  if (lowerDate.includes('next week')) {
    const nextMonday = new Date(today);
    const currentDay = today.getDay();
    const daysUntilMonday = currentDay === 0 ? 1 : (8 - currentDay);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    const result = nextMonday.toISOString().split('T')[0];
    console.log(`[DATE_CONVERT] "next week" → ${result}`);
    return result;
  }
  
  // Handle "end of month"
  if (lowerDate.includes('end of month')) {
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const result = endOfMonth.toISOString().split('T')[0];
    console.log(`[DATE_CONVERT] "end of month" → ${result}`);
    return result;
  }
  
  // Handle "ASAP" - treat as today
  if (lowerDate === 'asap' || lowerDate.includes('immediately')) {
    const result = today.toISOString().split('T')[0];
    console.log(`[DATE_CONVERT] "ASAP" → ${result}`);
    return result;
  }
  
  // Try to parse as a date string
  const parsed = new Date(relativeDate);
  if (!isNaN(parsed.getTime())) {
    const result = parsed.toISOString().split('T')[0];
    console.log(`[DATE_CONVERT] Parsed as date: ${result}`);
    return result;
  }
  
  console.warn(`[DATE_CONVERT] Could not parse date: "${relativeDate}" - will be skipped`);
  return null;
}

/**
 * Validate date string is in YYYY-MM-DD format (legacy, kept for reference)
 */
function isValidDate(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) {
    return false;
  }
  
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}
