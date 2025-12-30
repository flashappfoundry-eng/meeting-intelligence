export type AsanaAccessToken = string;

const ASANA_API_BASE = "https://app.asana.com/api/1.0";

type AsanaWorkspace = { gid: string; name?: string };
type AsanaUserMe = {
  gid: string;
  email?: string;
  workspaces?: AsanaWorkspace[];
};

export function createAsanaClient(accessToken: AsanaAccessToken) {
  async function asanaFetch(path: string, init?: RequestInit) {
    const res = await fetch(`${ASANA_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Asana API error (${res.status}): ${text || res.statusText}`);
    }
    return text ? (JSON.parse(text) as unknown) : null;
  }

  return {
    async getMe(): Promise<AsanaUserMe> {
      const json = (await asanaFetch("/users/me")) as { data: AsanaUserMe };
      return json.data;
    },

    async createTask(input: { name: string; workspaceGid: string }) {
      const json = (await asanaFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({ data: { name: input.name, workspace: input.workspaceGid } }),
      })) as { data: { gid: string; name?: string } };
      return json.data;
    },
  } as const;
}


