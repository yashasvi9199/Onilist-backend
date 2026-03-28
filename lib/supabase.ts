import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY; // Use secret key for backend

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create a single supabase client for interacting with your database
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});

// Database types and helpers
export interface ReadingProgress {
  id?: string;
  user_id: string;
  manga_id: string;
  source_id: string;
  anilist_id?: number;
  current_chapter: number;
  total_chapters: number;
  scroll_position: number;
  scroll_height: number;
  viewport_height: number;
  last_read_at: string;
  title: string;
  cover_url: string;
  created_at?: string;
  updated_at?: string;
}

export interface ScrollComment {
  id?: string;
  manga_id: string;
  chapter_number: number;
  source_id: string;
  scroll_position: number;
  user_id: string;
  username: string;
  user_avatar?: string;
  content: string;
  reactions: {
    like: number;
    laugh: number;
    shock: number;
    cry: number;
  };
  is_visible: boolean;
  report_count: number;
  created_at?: string;
  updated_at?: string;
}