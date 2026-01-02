// lib/mcp/tools/create-tasks.ts
import { type AuthenticatedUser } from "@/lib/auth/mcp-auth";

export async function handleCreateTasks(
  user: AuthenticatedUser,
  args: Record<string, unknown>
) {
  // TODO: Implement Asana task creation
  void user;
  void args;
  return {
    content: [
      {
        type: "text",
        text: "Task creation functionality coming soon.",
      },
    ],
  };
}

