export type ZoomAccessToken = string;

const ZOOM_API_BASE = "https://api.zoom.us/v2";

export type ZoomMeeting = {
  id: number | string;
  uuid?: string;
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

export type ZoomRecordingFile = {
  id: string;
  meeting_id: string;
  recording_start: string;
  recording_end: string;
  file_type: "MP4" | "M4A" | "CHAT" | "TRANSCRIPT" | "VTT" | "CC" | "CSV" | "SUMMARY";
  file_size?: number;
  download_url: string;
  play_url?: string;
  status: string;
  recording_type?: string;
};

export type ZoomRecordingsResponse = {
  uuid: string;
  id: number | string;
  account_id: string;
  host_id: string;
  topic: string;
  type: number;
  start_time: string;
  timezone: string;
  duration: number;
  total_size?: number;
  recording_count?: number;
  share_url?: string;
  recording_files?: ZoomRecordingFile[];
  participant_audio_files?: ZoomRecordingFile[];
};

export type ZoomPastMeetingDetails = {
  uuid: string;
  id: number | string;
  host_id: string;
  type: number;
  topic: string;
  start_time: string;
  end_time: string;
  duration: number;
  total_minutes?: number;
  participants_count?: number;
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

    /**
     * Get past meeting details (for completed meetings)
     * Note: meetingId should be the meeting UUID for past meetings
     */
    async getPastMeetingDetails(meetingId: string): Promise<ZoomPastMeetingDetails> {
      // Double-encode UUID if it contains / or //
      const encodedId = meetingId.includes('/') 
        ? encodeURIComponent(encodeURIComponent(meetingId))
        : encodeURIComponent(meetingId);
      const json = (await zoomFetch(`/past_meetings/${encodedId}`)) as ZoomPastMeetingDetails;
      return json;
    },

    /**
     * Get cloud recordings for a meeting
     * Note: meetingId should be the meeting ID (not UUID) for this endpoint
     */
    async getMeetingRecordings(meetingId: string): Promise<ZoomRecordingsResponse> {
      console.log(`[Zoom API] getMeetingRecordings called for meeting ${meetingId}`);
      const json = (await zoomFetch(`/meetings/${encodeURIComponent(meetingId)}/recordings`)) as ZoomRecordingsResponse;
      return json;
    },

    /**
     * List all cloud recordings for the user
     */
    async listUserRecordings(options?: { 
      from?: string; 
      to?: string; 
      pageSize?: number;
    }): Promise<{ meetings: ZoomRecordingsResponse[] }> {
      const params = new URLSearchParams();
      if (options?.from) params.set("from", options.from);
      if (options?.to) params.set("to", options.to);
      params.set("page_size", String(options?.pageSize || 30));
      
      const json = (await zoomFetch(`/users/me/recordings?${params.toString()}`)) as { 
        meetings: ZoomRecordingsResponse[];
      };
      return json;
    },

    /**
     * Download a recording file (returns the content)
     * For transcript files, this returns the VTT/text content
     */
    async downloadRecordingFile(downloadUrl: string): Promise<string> {
      console.log(`[Zoom API] Downloading recording file from ${downloadUrl.substring(0, 50)}...`);
      
      // The download URL already includes authentication via a token param,
      // but we also add the Bearer token for consistency
      const res = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[Zoom API] Download failed: ${res.status} - ${text}`);
        throw new Error(`Failed to download recording (${res.status}): ${text || res.statusText}`);
      }

      const content = await res.text();
      console.log(`[Zoom API] Downloaded ${content.length} characters`);
      return content;
    },

    /**
     * Get meeting transcript if available
     * Returns null if no transcript found
     */
    async getMeetingTranscript(meetingId: string): Promise<{ transcript: string; format: string } | null> {
      console.log(`[Zoom API] getMeetingTranscript called for meeting ${meetingId}`);
      
      try {
        const recordings = await this.getMeetingRecordings(meetingId);
        
        if (!recordings.recording_files?.length) {
          console.log(`[Zoom API] No recording files found for meeting ${meetingId}`);
          return null;
        }

        // Look for transcript file (VTT or TRANSCRIPT type)
        const transcriptFile = recordings.recording_files.find(
          f => f.file_type === "TRANSCRIPT" || f.file_type === "VTT"
        );

        if (!transcriptFile) {
          console.log(`[Zoom API] No transcript file found. Available file types:`, 
            recordings.recording_files.map(f => f.file_type));
          return null;
        }

        console.log(`[Zoom API] Found transcript file: ${transcriptFile.file_type}`);
        
        // Download the transcript
        const content = await this.downloadRecordingFile(transcriptFile.download_url);
        
        return {
          transcript: content,
          format: transcriptFile.file_type,
        };
      } catch (error) {
        console.error(`[Zoom API] Error getting transcript:`, error);
        // Return null instead of throwing - caller can handle gracefully
        return null;
      }
    },
  } as const;
}


