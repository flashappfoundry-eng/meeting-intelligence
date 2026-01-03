/**
 * Asana API Client
 * 
 * Provides methods for interacting with Asana's REST API for:
 * - User information
 * - Workspaces
 * - Projects
 * - Task creation with assignee resolution and priority tags
 */

export type AsanaAccessToken = string;

const ASANA_API_BASE = "https://app.asana.com/api/1.0";

// Priority tag names used in Asana
const PRIORITY_TAGS = {
  high: "P1 🔴 High Priority",
  medium: "P2 🟡 Medium",
  low: "P3 🟢 Low",
} as const;

// Cache for workspace users (keyed by workspaceGid)
const workspaceUsersCache = new Map<string, AsanaUser[]>();

// Cache for priority tags (keyed by workspaceGid:priority)
const priorityTagsCache = new Map<string, string>();

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
  tags?: string[]; // Tag GIDs
}

/**
 * Enhanced task input that accepts human-readable assignee names and priorities
 */
export interface EnhancedTaskInput {
  name: string;
  notes?: string;
  due_on?: string; // YYYY-MM-DD format
  assigneeName?: string | null; // Human-readable name (will be resolved to GID)
  priority?: "high" | "medium" | "low";
  projectGid: string;
  workspaceGid: string;
}

export interface AsanaTag {
  gid: string;
  name: string;
  resource_type?: string;
}

export interface AsanaTaskCreateResult {
  success: boolean;
  task?: AsanaTask;
  error?: string;
}

// ============================================
// Helper Functions for Assignee Resolution
// ============================================

/**
 * Fetch all users in a workspace (with caching)
 */
async function fetchWorkspaceUsers(
  accessToken: string,
  workspaceGid: string
): Promise<AsanaUser[]> {
  // Check cache first
  const cached = workspaceUsersCache.get(workspaceGid);
  if (cached) {
    console.log(`[Asana] Using cached users for workspace ${workspaceGid}`);
    return cached;
  }

  console.log(`[Asana] Fetching users for workspace ${workspaceGid}`);
  
  try {
    const response = await fetch(
      `${ASANA_API_BASE}/workspaces/${workspaceGid}/users?opt_fields=name,email`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      console.warn(`[Asana] Failed to fetch workspace users: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const users = data.data as AsanaUser[];
    
    // Cache the results
    workspaceUsersCache.set(workspaceGid, users);
    console.log(`[Asana] Cached ${users.length} users for workspace ${workspaceGid}`);
    
    return users;
  } catch (error) {
    console.warn("[Asana] Error fetching workspace users:", error);
    return [];
  }
}

/**
 * Resolve an assignee name to an Asana user GID using fuzzy matching
 */
async function resolveAssigneeToGid(
  accessToken: string,
  workspaceGid: string,
  assigneeName: string | null | undefined
): Promise<string | null> {
  console.log(`[Asana] ====== RESOLVING ASSIGNEE ======`);
  console.log(`[Asana] Input assignee name: "${assigneeName}"`);
  console.log(`[Asana] Workspace GID: ${workspaceGid}`);
  
  if (!assigneeName || assigneeName.toLowerCase() === "unassigned") {
    console.log(`[Asana] Skipping - assignee is null or "unassigned"`);
    return null;
  }

  const users = await fetchWorkspaceUsers(accessToken, workspaceGid);
  
  console.log(`[Asana] Found ${users.length} users in workspace`);
  console.log(`[Asana] Available users:`, users.map(u => ({ name: u.name, email: u.email, gid: u.gid })));
  
  if (users.length === 0) {
    console.log(`[Asana] No users found in workspace, cannot resolve assignee "${assigneeName}"`);
    return null;
  }

  const normalizedSearch = assigneeName.toLowerCase().trim();
  console.log(`[Asana] Searching for: "${normalizedSearch}"`);
  
  // Try exact match first
  let match = users.find(
    (user) => user.name?.toLowerCase() === normalizedSearch
  );
  if (match) {
    console.log(`[Asana] ✓ EXACT MATCH: "${assigneeName}" → "${match.name}" (${match.gid})`);
    return match.gid;
  }
  console.log(`[Asana] No exact match found`);

  // Try partial match (assignee name contained in user name)
  match = users.find(
    (user) => user.name?.toLowerCase().includes(normalizedSearch)
  );
  if (match) {
    console.log(`[Asana] ✓ PARTIAL MATCH (name contains): "${assigneeName}" → "${match.name}" (${match.gid})`);
    return match.gid;
  }
  console.log(`[Asana] No partial match (name contains) found`);

  // Try reverse partial match (user first name contained in assignee)
  match = users.find((user) => {
    const firstName = user.name?.split(" ")[0]?.toLowerCase();
    return firstName && normalizedSearch.includes(firstName);
  });
  if (match) {
    console.log(`[Asana] ✓ REVERSE MATCH (first name): "${assigneeName}" → "${match.name}" (${match.gid})`);
    return match.gid;
  }
  console.log(`[Asana] No reverse match (first name) found`);

  // Try matching by email prefix
  match = users.find((user) => {
    const emailPrefix = user.email?.split("@")[0]?.toLowerCase();
    return emailPrefix && (
      emailPrefix.includes(normalizedSearch) || 
      normalizedSearch.includes(emailPrefix)
    );
  });
  if (match) {
    console.log(`[Asana] ✓ EMAIL MATCH: "${assigneeName}" → "${match.name}" (${match.gid})`);
    return match.gid;
  }
  console.log(`[Asana] No email match found`);

  console.log(`[Asana] ✗ NO MATCH FOUND for "${assigneeName}"`);
  console.log(`[Asana] Available user names: ${users.map(u => u.name).join(', ')}`);
  return null;
}

// ============================================
// Helper Functions for Priority Tags
// ============================================

/**
 * Get or create a priority tag in a workspace
 */
async function getOrCreatePriorityTag(
  accessToken: string,
  workspaceGid: string,
  priority: "high" | "medium" | "low"
): Promise<string | null> {
  const cacheKey = `${workspaceGid}:${priority}`;
  
  // Check cache first
  const cached = priorityTagsCache.get(cacheKey);
  if (cached) {
    console.log(`[Asana] Using cached priority tag for ${priority}`);
    return cached;
  }

  const tagName = PRIORITY_TAGS[priority];
  console.log(`[Asana] Looking for priority tag "${tagName}" in workspace ${workspaceGid}`);

  try {
    // First, search for existing tag
    const searchResponse = await fetch(
      `${ASANA_API_BASE}/workspaces/${workspaceGid}/tags?opt_fields=name&limit=100`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (searchResponse.ok) {
      const { data } = await searchResponse.json();
      const existingTag = (data as AsanaTag[]).find((t) => t.name === tagName);
      
      if (existingTag) {
        console.log(`[Asana] Found existing priority tag: ${existingTag.gid}`);
        priorityTagsCache.set(cacheKey, existingTag.gid);
        return existingTag.gid;
      }
    }

    // Tag not found, create it
    console.log(`[Asana] Creating priority tag "${tagName}"`);
    const createResponse = await fetch(
      `${ASANA_API_BASE}/workspaces/${workspaceGid}/tags`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: { name: tagName },
        }),
      }
    );

    if (createResponse.ok) {
      const { data } = await createResponse.json();
      console.log(`[Asana] Created priority tag: ${data.gid}`);
      priorityTagsCache.set(cacheKey, data.gid);
      return data.gid;
    }

    console.warn(`[Asana] Failed to create priority tag: ${createResponse.status}`);
    return null;
  } catch (error) {
    console.warn("[Asana] Error managing priority tag:", error);
    return null;
  }
}

/**
 * Clear caches (useful for testing or when user reconnects)
 */
export function clearAsanaCaches(): void {
  workspaceUsersCache.clear();
  priorityTagsCache.clear();
  console.log("[Asana] Cleared all caches");
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
     * Create a task with enhanced features:
     * - Resolves assignee names to Asana user GIDs
     * - Adds priority tags (P1/P2/P3)
     */
    async createEnhancedTask(task: EnhancedTaskInput): Promise<AsanaTask> {
      console.log(`[Asana API] ====== CREATE ENHANCED TASK ======`);
      console.log(`[Asana API] Task name: ${task.name}`);
      console.log(`[Asana API] Input assignee name: "${task.assigneeName || "(none)"}"`);
      console.log(`[Asana API] Input priority: ${task.priority || "(none)"}`);
      console.log(`[Asana API] Input due_on: ${task.due_on || "(none)"}`);
      console.log(`[Asana API] Workspace GID: ${task.workspaceGid}`);
      console.log(`[Asana API] Project GID: ${task.projectGid}`);
      
      // Resolve assignee name to GID
      console.log(`[Asana API] Resolving assignee...`);
      const assigneeGid = task.assigneeName
        ? await resolveAssigneeToGid(accessToken, task.workspaceGid, task.assigneeName)
        : null;
      console.log(`[Asana API] Resolved assignee GID: ${assigneeGid || "(not resolved)"}`);
      
      // Get priority tag GID
      console.log(`[Asana API] Getting priority tag...`);
      const priorityTagGid = task.priority
        ? await getOrCreatePriorityTag(accessToken, task.workspaceGid, task.priority)
        : null;
      console.log(`[Asana API] Priority tag GID: ${priorityTagGid || "(no tag)"}`);
      
      // Build task data
      const taskData: Record<string, unknown> = {
        name: task.name,
        workspace: task.workspaceGid,
        projects: [task.projectGid],
      };
      
      if (task.notes) {
        taskData.notes = task.notes;
      }
      
      if (task.due_on) {
        taskData.due_on = task.due_on;
      }
      
      if (assigneeGid) {
        taskData.assignee = assigneeGid;
      }
      
      if (priorityTagGid) {
        taskData.tags = [priorityTagGid];
      }
      
      console.log(`[Asana API] ====== SENDING TO ASANA ======`);
      console.log(`[Asana API] Request body:`, JSON.stringify({ data: taskData }, null, 2));
      
      // Create task with opt_fields to get assignee info back
      const createdTask = await asanaFetch<AsanaTask>("/tasks?opt_fields=gid,name,permalink_url,due_on,assignee,assignee.name,assignee.email,tags,tags.name", {
        method: "POST",
        body: JSON.stringify({ data: taskData }),
      });
      
      console.log(`[Asana API] ====== TASK CREATED ======`);
      console.log(`[Asana API] Created task GID: ${createdTask.gid}`);
      console.log(`[Asana API] Created task assignee:`, createdTask.assignee);
      console.log(`[Asana API] Created task URL: ${createdTask.permalink_url}`);
      
      return createdTask;
    },

    /**
     * Create multiple enhanced tasks with assignee resolution and priorities
     */
    async createEnhancedTasks(
      tasks: EnhancedTaskInput[]
    ): Promise<AsanaTaskCreateResult[]> {
      console.log(`[Asana API] Creating ${tasks.length} enhanced tasks`);
      
      const results: AsanaTaskCreateResult[] = [];
      
      for (const task of tasks) {
        try {
          const createdTask = await this.createEnhancedTask(task);
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
