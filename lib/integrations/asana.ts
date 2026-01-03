/**
 * Asana API Client
 * 
 * Provides methods for interacting with Asana's REST API for:
 * - User information
 * - Workspaces
 * - Projects
 * - Task creation with assignee resolution and priority custom fields
 * - Automatic token refresh on 401
 */

import { forceRefreshToken } from "@/lib/auth/tokens";

export type AsanaAccessToken = string;

const ASANA_API_BASE = "https://app.asana.com/api/1.0";

// Cache for workspace users (keyed by workspaceGid)
const workspaceUsersCache = new Map<string, AsanaUser[]>();

// Cache for custom field settings per project (keyed by projectGid)
const customFieldCache = new Map<string, PriorityFieldConfig>();

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

export interface AsanaCustomField {
  gid: string;
  name: string;
  resource_type?: string;
  enum_value?: {
    gid: string;
    name: string;
  } | null;
  text_value?: string | null;
  number_value?: number | null;
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
  custom_fields?: AsanaCustomField[];
}

export interface AsanaTaskInput {
  name: string;
  notes?: string;
  due_on?: string; // YYYY-MM-DD format
  assignee?: string; // User GID or "me"
  projects?: string[]; // Project GIDs
  workspace?: string; // Workspace GID (required if no project)
  custom_fields?: Record<string, string>; // Custom field GID -> value/enum GID
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

export interface AsanaTaskCreateResult {
  success: boolean;
  task?: AsanaTask;
  error?: string;
}

/**
 * Configuration for a Priority custom field on a project
 */
export interface PriorityFieldConfig {
  fieldGid: string;
  enumOptions: {
    high: string | null;    // GID for "High" option
    medium: string | null;  // GID for "Medium" option  
    low: string | null;     // GID for "Low" option
  };
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
// Helper Functions for Priority Custom Fields
// ============================================

/**
 * Discover the Priority custom field configuration for a project
 */
async function getPriorityFieldConfig(
  accessToken: string,
  projectGid: string
): Promise<PriorityFieldConfig | null> {
  console.log(`[Asana] ====== DISCOVERING PRIORITY CUSTOM FIELD ======`);
  console.log(`[Asana] Project GID: ${projectGid}`);
  console.log(`[Asana] Access token preview: ${accessToken.substring(0, 20)}...`);
  
  // Check cache first
  const cached = customFieldCache.get(projectGid);
  if (cached) {
    console.log(`[Asana] ✓ Using cached priority field config`);
    return cached;
  }
  
  try {
    // Get custom field settings for the project with comprehensive opt_fields
    const url = `${ASANA_API_BASE}/projects/${projectGid}/custom_field_settings?opt_fields=custom_field.gid,custom_field.name,custom_field.type,custom_field.resource_subtype,custom_field.enum_options.gid,custom_field.enum_options.name,custom_field.enum_options.enabled`;
    console.log(`[Asana] Fetching custom fields from: ${url}`);
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    console.log(`[Asana] Response status: ${response.status}`);
    console.log(`[Asana] Response headers:`, Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[Asana] Failed to get custom fields: ${response.status}`);
      console.log(`[Asana] Error response body: ${errorText}`);
      return null;
    }
    
    const responseData = await response.json();
    
    // LOG THE RAW RESPONSE
    console.log(`[Asana] ========== RAW API RESPONSE ==========`);
    console.log(`[Asana] ${JSON.stringify(responseData, null, 2)}`);
    console.log(`[Asana] =======================================`);
    
    const settings = responseData.data || [];
    console.log(`[Asana] Found ${settings.length} custom field setting(s) on project`);
    
    if (settings.length === 0) {
      console.log(`[Asana] Project has no custom fields - responseData.data is empty or missing`);
      console.log(`[Asana] Full responseData keys: ${Object.keys(responseData).join(', ')}`);
      return null;
    }
    
    // Log all available custom fields with full details
    console.log(`[Asana] ========== AVAILABLE CUSTOM FIELDS ==========`);
    settings.forEach((s: { custom_field?: { name?: string; gid?: string; type?: string; resource_subtype?: string } }, i: number) => {
      const cf = s.custom_field;
      console.log(`[Asana] Field ${i + 1}:`);
      console.log(`[Asana]   - name: "${cf?.name}"`);
      console.log(`[Asana]   - gid: ${cf?.gid}`);
      console.log(`[Asana]   - type: ${cf?.type}`);
      console.log(`[Asana]   - resource_subtype: ${cf?.resource_subtype}`);
    });
    console.log(`[Asana] ==============================================`);
    
    // Look for a Priority field - try multiple matching strategies
    console.log(`[Asana] Searching for Priority field...`);
    
    const prioritySetting = settings.find((s: { custom_field?: { name?: string } }) => {
      const fieldName = s.custom_field?.name;
      if (!fieldName) {
        console.log(`[Asana] Skipping field with no name`);
        return false;
      }
      
      const lowerName = fieldName.toLowerCase().trim();
      const isMatch = lowerName === 'priority' || 
                      lowerName.includes('priority') ||
                      lowerName === 'p1/p2/p3' ||
                      lowerName === 'urgency';
      
      console.log(`[Asana] Checking "${fieldName}" (lowercase: "${lowerName}") → ${isMatch ? 'MATCH!' : 'no match'}`);
      return isMatch;
    });
    
    if (!prioritySetting) {
      console.log(`[Asana] ✗ No "Priority" custom field found among ${settings.length} fields`);
      console.log(`[Asana] Field names found: ${settings.map((s: { custom_field?: { name?: string } }) => `"${s.custom_field?.name}"`).join(', ')}`);
      console.log(`[Asana] To use priority, add a "Priority" custom field with High/Medium/Low options`);
      return null;
    }
    
    const field = prioritySetting.custom_field;
    console.log(`[Asana] ✓ Found Priority field: "${field.name}" (${field.gid})`);
    console.log(`[Asana] Field type: ${field.type}`);
    console.log(`[Asana] Field resource_subtype: ${field.resource_subtype}`);
    
    // Map enum options (look for High/Medium/Low variants)
    const enumOptions: PriorityFieldConfig["enumOptions"] = {
      high: null,
      medium: null,
      low: null,
    };
    
    if (field.enum_options && field.enum_options.length > 0) {
      console.log(`[Asana] Enum options available (${field.enum_options.length}):`);
      for (const opt of field.enum_options) {
        console.log(`[Asana]   - "${opt.name}" (gid: ${opt.gid}, enabled: ${opt.enabled})`);
        const name = opt.name.toLowerCase();
        
        if (name.includes('high') || name === 'p1' || name === '1') {
          enumOptions.high = opt.gid;
          console.log(`[Asana] ✓ Mapped HIGH → "${opt.name}" (${opt.gid})`);
        } else if (name.includes('medium') || name === 'p2' || name === '2' || name === 'normal') {
          enumOptions.medium = opt.gid;
          console.log(`[Asana] ✓ Mapped MEDIUM → "${opt.name}" (${opt.gid})`);
        } else if (name.includes('low') || name === 'p3' || name === '3') {
          enumOptions.low = opt.gid;
          console.log(`[Asana] ✓ Mapped LOW → "${opt.name}" (${opt.gid})`);
        }
      }
    } else {
      console.log(`[Asana] Priority field has no enum options - field.enum_options: ${JSON.stringify(field.enum_options)}`);
    }
    
    console.log(`[Asana] Final enum mappings: high=${enumOptions.high}, medium=${enumOptions.medium}, low=${enumOptions.low}`);
    
    const config: PriorityFieldConfig = {
      fieldGid: field.gid,
      enumOptions,
    };
    
    // Cache the result
    customFieldCache.set(projectGid, config);
    console.log(`[Asana] ✓ Cached priority field config for project`);
    
    return config;
    
  } catch (error) {
    console.error(`[Asana] ✗ Error discovering priority field:`, error);
    console.error(`[Asana] Error stack:`, error instanceof Error ? error.stack : 'no stack');
    return null;
  }
}

/**
 * Clear caches (useful for testing or when user reconnects)
 */
export function clearAsanaCaches(): void {
  workspaceUsersCache.clear();
  customFieldCache.clear();
  console.log("[Asana] Cleared all caches");
}

// ============================================
// Client Factory
// ============================================

/**
 * Create an Asana API client with automatic token refresh on 401
 * @param accessToken - The current access token
 * @param userId - Optional user ID for automatic token refresh on 401
 */
export function createAsanaClient(accessToken: AsanaAccessToken, userId?: string) {
  // Make token mutable for refresh
  let currentAccessToken = accessToken;
  let hasAttemptedRefresh = false;
  
  /**
   * Make an authenticated request to Asana API with auto-refresh on 401
   */
  async function asanaFetch<T>(
    path: string, 
    init?: RequestInit
  ): Promise<T> {
    const url = `${ASANA_API_BASE}${path}`;
    console.log(`[Asana API] ${init?.method || "GET"} ${path}`);
    
    const makeRequest = async (token: string): Promise<Response> => {
      return fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init?.headers ?? {}),
        },
      });
    };
    
    let res = await makeRequest(currentAccessToken);
    let text = await res.text();
    
    // If 401 and we have userId, try to refresh token and retry
    if (res.status === 401 && userId && !hasAttemptedRefresh) {
      console.log(`[Asana API] Got 401, attempting token refresh for user ${userId}...`);
      hasAttemptedRefresh = true;
      
      try {
        const refreshedTokens = await forceRefreshToken(userId, "asana");
        currentAccessToken = refreshedTokens.accessToken;
        console.log(`[Asana API] Token refreshed successfully, retrying request...`);
        
        // Retry the request with new token
        res = await makeRequest(currentAccessToken);
        text = await res.text();
      } catch (refreshError) {
        console.error(`[Asana API] Token refresh failed:`, refreshError);
        // Fall through to return the original 401 error
      }
    }
    
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
      
      if (task.custom_fields) {
        taskData.custom_fields = task.custom_fields;
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
     * - Sets priority via custom fields (if project has a Priority field)
     */
    async createEnhancedTask(task: EnhancedTaskInput): Promise<AsanaTask> {
      console.log(`[Asana API] ====== CREATE ENHANCED TASK ======`);
      console.log(`[Asana API] Task name: ${task.name}`);
      console.log(`[Asana API] Input assignee name: "${task.assigneeName || "(none)"}"`);
      console.log(`[Asana API] Input priority: ${task.priority || "(none)"}`);
      console.log(`[Asana API] Input due_on: ${task.due_on || "(none)"}`);
      console.log(`[Asana API] Workspace GID: ${task.workspaceGid}`);
      console.log(`[Asana API] Project GID: ${task.projectGid}`);
      
      // Resolve assignee name to GID (use currentAccessToken which may have been refreshed)
      console.log(`[Asana API] Resolving assignee...`);
      const assigneeGid = task.assigneeName
        ? await resolveAssigneeToGid(currentAccessToken, task.workspaceGid, task.assigneeName)
        : null;
      console.log(`[Asana API] Resolved assignee GID: ${assigneeGid || "(not resolved)"}`);
      
      // Priority via custom fields
      console.log(`[Asana API] ====== PRIORITY CUSTOM FIELD ======`);
      let customFields: Record<string, string> | undefined;
      
      if (task.priority && task.projectGid) {
        console.log(`[Asana API] Task priority: ${task.priority}`);
        console.log(`[Asana API] Looking up Priority custom field for project...`);
        
        const priorityConfig = await getPriorityFieldConfig(currentAccessToken, task.projectGid);
        
        if (priorityConfig) {
          const enumOptionGid = priorityConfig.enumOptions[task.priority];
          if (enumOptionGid) {
            customFields = {
              [priorityConfig.fieldGid]: enumOptionGid
            };
            console.log(`[Asana API] ✓ Will set Priority custom field:`);
            console.log(`[Asana API]   Field GID: ${priorityConfig.fieldGid}`);
            console.log(`[Asana API]   Enum Option GID: ${enumOptionGid}`);
          } else {
            console.log(`[Asana API] ⚠️ No enum option found for priority "${task.priority}"`);
            console.log(`[Asana API] Available mappings:`, priorityConfig.enumOptions);
          }
        } else {
          console.log(`[Asana API] ⚠️ Project has no Priority custom field - priority will be skipped`);
        }
      } else {
        console.log(`[Asana API] No priority specified or no project GID`);
      }
      
      // Build task data
      console.log(`[Asana API] ====== BUILDING TASK DATA ======`);
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
      
      if (customFields) {
        taskData.custom_fields = customFields;
        console.log(`[Asana API] ✓ Custom fields added:`, customFields);
      } else {
        console.log(`[Asana API] No custom fields to add`);
      }
      
      console.log(`[Asana API] ====== SENDING TO ASANA ======`);
      console.log(`[Asana API] Final taskData keys: ${Object.keys(taskData).join(', ')}`);
      console.log(`[Asana API] Full request body:`, JSON.stringify({ data: taskData }, null, 2));
      
      // Create task with opt_fields to get assignee and custom fields back
      const createdTask = await asanaFetch<AsanaTask>("/tasks?opt_fields=gid,name,permalink_url,due_on,assignee,assignee.name,assignee.email,custom_fields,custom_fields.name,custom_fields.enum_value,custom_fields.enum_value.name", {
        method: "POST",
        body: JSON.stringify({ data: taskData }),
      });
      
      console.log(`[Asana API] ====== TASK CREATED ======`);
      console.log(`[Asana API] Created task GID: ${createdTask.gid}`);
      console.log(`[Asana API] Created task name: ${createdTask.name}`);
      console.log(`[Asana API] Created task assignee:`, createdTask.assignee ? `${createdTask.assignee.name} (${createdTask.assignee.gid})` : '(none)');
      console.log(`[Asana API] Created task due_on: ${createdTask.due_on || '(none)'}`);
      console.log(`[Asana API] Created task URL: ${createdTask.permalink_url}`);
      
      // Log custom fields from response
      if (createdTask.custom_fields && createdTask.custom_fields.length > 0) {
        console.log(`[Asana API] ✓ Task has ${createdTask.custom_fields.length} custom field(s):`);
        for (const cf of createdTask.custom_fields) {
          const value = cf.enum_value?.name ?? cf.text_value ?? cf.number_value ?? '(empty)';
          console.log(`[Asana API]   - ${cf.name}: ${value}`);
        }
      } else {
        console.log(`[Asana API] Task has no custom fields in response`);
      }
      
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
     * Get the Priority custom field configuration for a project
     * Returns the field GID and enum option GIDs for high/medium/low
     */
    async getPriorityFieldConfig(projectGid: string): Promise<PriorityFieldConfig | null> {
      return getPriorityFieldConfig(currentAccessToken, projectGid);
    },
    
    /**
     * Get the current access token (may have been refreshed)
     */
    getCurrentAccessToken(): string {
      return currentAccessToken;
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
