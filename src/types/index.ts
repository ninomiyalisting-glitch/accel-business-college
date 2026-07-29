export interface SlackUser {
  slack_user_id: string
  display_name: string
  avatar_url: string
}

export interface Channel {
  id: string
  name: string
  description: string | null
  created_at: string
  slack_channel_id?: string | null
  is_hidden?: boolean
}

export interface SlackFile {
  id?: string
  name?: string
  mimetype?: string
  url_private?: string
  url_private_download?: string
  thumb_360?: string
  thumb_480?: string
}

export interface Message {
  id: string
  channel_id: string
  user_name: string
  content: string
  created_at: string
  thread_ts?: string | null
  files_json?: SlackFile[] | null
  avatar_url?: string | null
  slack_user_id?: string | null
}

export interface ReactionCount {
  reaction: string
  count: number
  users: string[]  // display_names of users who reacted
}

// key: message created_at (ISO string) → reactions for that message
export type ReactionsMap = Record<string, ReactionCount[]>

// name → image URL (Slack workspace custom emojis)
export type CustomEmojis = Record<string, string>
