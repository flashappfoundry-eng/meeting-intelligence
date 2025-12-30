export type ZoomAccessToken = string;

const ZOOM_API_BASE = "https://api.zoom.us/v2";

type ZoomMeeting = {
  id: number | string;
  topic?: string;
  start_time?: string;
};

export function createZoomClient(accessToken: ZoomAccessToken) {
  async function zoomFetch(path: string, init?: RequestInit) {
    const res = await fetch(`${ZOOM_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Zoom API error (${res.status}): ${text || res.statusText}`);
    }
    return text ? (JSON.parse(text) as unknown) : null;
  }

  return {
    async listRecentMeetings(limit = 10): Promise<ZoomMeeting[]> {
      const json = (await zoomFetch(
        `/users/me/meetings?page_size=${encodeURIComponent(String(limit))}&type=scheduled`,
      )) as { meetings?: ZoomMeeting[] };
      return json.meetings ?? [];
    },

    async getMeeting(meetingId: string): Promise<ZoomMeeting> {
      const json = (await zoomFetch(`/meetings/${encodeURIComponent(meetingId)}`)) as ZoomMeeting;
      return json;
    },
  } as const;
}


