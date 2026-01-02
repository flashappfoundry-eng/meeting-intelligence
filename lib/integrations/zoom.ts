export type ZoomAccessToken = string;

const ZOOM_API_BASE = "https://api.zoom.us/v2";

type ZoomMeeting = {
  id: number | string;
  topic?: string;
  start_time?: string;
  type?: number;
  duration?: number;
  timezone?: string;
  created_at?: string;
  join_url?: string;
};

type ZoomMeetingsResponse = {
  page_count?: number;
  page_number?: number;
  page_size?: number;
  total_records?: number;
  meetings?: ZoomMeeting[];
};

export function createZoomClient(accessToken: ZoomAccessToken) {
  async function zoomFetch(path: string, init?: RequestInit) {
    console.log(`[Zoom API] Calling: ${ZOOM_API_BASE}${path}`);
    
    const res = await fetch(`${ZOOM_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const text = await res.text();
    console.log(`[Zoom API] Response status: ${res.status}`);
    
    if (!res.ok) {
      console.error(`[Zoom API] Error response: ${text}`);
      throw new Error(`Zoom API error (${res.status}): ${text || res.statusText}`);
    }
    
    const parsed = text ? (JSON.parse(text) as unknown) : null;
    console.log(`[Zoom API] Response parsed:`, JSON.stringify(parsed).substring(0, 500));
    return parsed;
  }

  return {
    /**
     * List meetings for the authenticated user
     * @param limit - Max number of meetings to return
     * @param meetingType - Type of meetings to list:
     *   - "scheduled" (default) - upcoming scheduled meetings
     *   - "live" - ongoing meetings
     *   - "upcoming" - all upcoming meetings
     *   - "previous_meetings" - past meetings (ended)
     */
    async listRecentMeetings(
      limit = 10,
      meetingType: "scheduled" | "live" | "upcoming" | "previous_meetings" = "scheduled"
    ): Promise<ZoomMeeting[]> {
      console.log(`[Zoom API] listRecentMeetings called with limit=${limit}, type=${meetingType}`);
      
      const json = (await zoomFetch(
        `/users/me/meetings?page_size=${encodeURIComponent(String(limit))}&type=${meetingType}`,
      )) as ZoomMeetingsResponse;
      
      console.log(`[Zoom API] Found ${json.total_records ?? 0} total records, returned ${json.meetings?.length ?? 0} meetings`);
      
      return json.meetings ?? [];
    },

    /**
     * List all meeting types (scheduled + past) and combine results
     */
    async listAllMeetings(limit = 10): Promise<ZoomMeeting[]> {
      console.log(`[Zoom API] listAllMeetings called with limit=${limit}`);
      
      // Fetch both scheduled and past meetings
      const [scheduled, past] = await Promise.all([
        this.listRecentMeetings(limit, "scheduled").catch(e => {
          console.error("[Zoom API] Error fetching scheduled:", e);
          return [] as ZoomMeeting[];
        }),
        this.listRecentMeetings(limit, "previous_meetings").catch(e => {
          console.error("[Zoom API] Error fetching previous:", e);
          return [] as ZoomMeeting[];
        }),
      ]);
      
      console.log(`[Zoom API] Found ${scheduled.length} scheduled, ${past.length} past meetings`);
      
      // Combine and sort by start_time (most recent first)
      const all = [...scheduled, ...past];
      all.sort((a, b) => {
        const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
        const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
        return bTime - aTime;
      });
      
      return all.slice(0, limit);
    },

    async getMeeting(meetingId: string): Promise<ZoomMeeting> {
      const json = (await zoomFetch(`/meetings/${encodeURIComponent(meetingId)}`)) as ZoomMeeting;
      return json;
    },
    
    /**
     * Get user info to verify the token is working
     */
    async getMe(): Promise<{ id: string; email: string; first_name?: string; last_name?: string }> {
      const json = (await zoomFetch(`/users/me`)) as { 
        id: string; 
        email: string; 
        first_name?: string; 
        last_name?: string;
      };
      return json;
    },
  } as const;
}


