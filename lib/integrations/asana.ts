/**
 * Asana API Client
 * 
 * Provides methods for interacting with Asana's REST API for:
 * - User information
 * - Workspaces
 * - Projects
 * - Task creation
 */

export type AsanaAccessToken = string;

const ASANA_API_BASE = "https://app.asana.com/api/1.0";

// ============================================
// Types
// ============================================

export interface AsanaUser {
  gid: string;
  name?: string;
  email?: string;
  workspaces?: AsanaWorkspace[];
}

export interface AsanaWorkspace {
  gid: string;
  name: string;
  resource_type?: string;
}

export interface AsanaProject {
  gid: string;
  name: string;
  resource_type?: string;
}

export interface AsanaTask {
  gid: string;
  name: string;
  resource_type?: string;
  permalink_url?: string;
  due_on?: string;
  notes?: string;
  assignee?: AsanaUser | null;
  projects?: AsanaProject[];
}

export interface AsanaTaskInput {
  name: string;
  notes?: string;
  due_on?: string; // YYYY-MM-DD format
  assignee?: string; // User GID or "me"
  projects?: string[]; // Project GIDs
  workspace?: string; // Workspace GID (required if no project)
}

export interface AsanaTaskCreateResult {
  success: boolean;
  task?: AsanaTask;
  error?: string;
}

// ============================================
// Client Factory
// ============================================

export function createAsanaClient(accessToken: AsanaAccessToken) {
  /**
   * Make an authenticated request to Asana API
   */
  async function asanaFetch<T>(
    path: string, 
    init?: RequestInit
  ): Promise<T> {
    const url = `${ASANA_API_BASE}${path}`;
    console.log(`[Asana API] ${init?.method || "GET"} ${path}`);
    
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const text = await res.text();
    
    if (!res.ok) {
      console.error(`[Asana API] Error ${res.status}:`, text);
      
      // Parse Asana error format
      let errorMessage = `Asana API error (${res.status})`;
      try {
        const errorData = JSON.parse(text);
        if (errorData.errors?.[0]?.message) {
          errorMessage = errorData.errors[0].message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        errorMessage = text || res.statusText;
      }
      
      const error = new Error(errorMessage);
      (error as Error & { status: number }).status = res.status;
      throw error;
    }
    
    if (!text) {
      return {} as T;
    }
    
    const json = JSON.parse(text) as { data: T };
    return json.data;
  }

  return {
    /**
     * Get current authenticated user
     */
    async getMe(): Promise<AsanaUser> {
      console.log("[Asana API] Getting current user");
      return asanaFetch<AsanaUser>("/users/me");
    },

    /**
     * Get all workspaces the user has access to
     */
    async getWorkspaces(): Promise<AsanaWorkspace[]> {
      console.log("[Asana API] Getting workspaces");
      return asanaFetch<AsanaWorkspace[]>("/workspaces");
    },

    /**
     * Get projects in a workspace
     */
    async getProjects(workspaceGid: string, options?: { 
      archived?: boolean;
      limit?: number;
    }): Promise<AsanaProject[]> {
      console.log(`[Asana API] Getting projects for workspace ${workspaceGid}`);
      
      const params = new URLSearchParams();
      params.set("workspace", workspaceGid);
      if (options?.archived !== undefined) {
        params.set("archived", String(options.archived));
      }
      if (options?.limit) {
        params.set("limit", String(options.limit));
      }
      
      return asanaFetch<AsanaProject[]>(`/projects?${params.toString()}`);
    },

    /**
     * Create a single task
     */
    async createTask(task: AsanaTaskInput): Promise<AsanaTask> {
      console.log(`[Asana API] Creating task: ${task.name}`);
      
      // Build the task data
      const taskData: Record<string, unknown> = {
        name: task.name,
      };
      
      if (task.notes) {
        taskData.notes = task.notes;
      }
      
      if (task.due_on) {
        taskData.due_on = task.due_on;
      }
      
      if (task.assignee) {
        taskData.assignee = task.assignee;
      }
      
      if (task.projects?.length) {
        taskData.projects = task.projects;
      }
      
      if (task.workspace) {
        taskData.workspace = task.workspace;
      }
      
      return asanaFetch<AsanaTask>("/tasks", {
        method: "POST",
        body: JSON.stringify({ data: taskData }),
      });
    },

    /**
     * Create multiple tasks
     * Returns results for each task (success or failure)
     */
    async createTasks(
      tasks: AsanaTaskInput[]
    ): Promise<AsanaTaskCreateResult[]> {
      console.log(`[Asana API] Creating ${tasks.length} tasks`);
      
      const results: AsanaTaskCreateResult[] = [];
      
      for (const task of tasks) {
        try {
          const createdTask = await this.createTask(task);
          results.push({
            success: true,
            task: createdTask,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[Asana API] Failed to create task "${task.name}":`, message);
          results.push({
            success: false,
            error: message,
          });
        }
      }
      
      return results;
    },

    /**
     * Get a single task by GID
     */
    async getTask(taskGid: string): Promise<AsanaTask> {
      console.log(`[Asana API] Getting task ${taskGid}`);
      return asanaFetch<AsanaTask>(`/tasks/${taskGid}`);
    },

    /**
     * Search for a user by email within a workspace
     * Returns the user GID if found
     */
    async findUserByEmail(
      workspaceGid: string, 
      email: string
    ): Promise<string | null> {
      console.log(`[Asana API] Searching for user ${email} in workspace ${workspaceGid}`);
      
      try {
        const params = new URLSearchParams();
        params.set("workspace", workspaceGid);
        
        const users = await asanaFetch<AsanaUser[]>(
          `/workspaces/${workspaceGid}/users?${params.toString()}`
        );
        
        const found = users.find(u => 
          u.email?.toLowerCase() === email.toLowerCase()
        );
        
        return found?.gid || null;
      } catch {
        // User search may not be available, return null
        return null;
      }
    },

    /**
     * Get the default workspace for the user
     * Returns the first workspace, or null if none
     */
    async getDefaultWorkspace(): Promise<AsanaWorkspace | null> {
      const workspaces = await this.getWorkspaces();
      return workspaces[0] || null;
    },

    /**
     * Get the default project in a workspace
     * Returns the first non-archived project, or null
     */
    async getDefaultProject(workspaceGid: string): Promise<AsanaProject | null> {
      const projects = await this.getProjects(workspaceGid, { 
        archived: false, 
        limit: 1 
      });
      return projects[0] || null;
    },
  } as const;
}

// ============================================
// Utility Types
// ============================================

export type AsanaClient = ReturnType<typeof createAsanaClient>;
