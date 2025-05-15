import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

// Debugging: Log environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Environment variables are missing:");
  console.error("NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl);
  console.error("NEXT_PUBLIC_SUPABASE_ANON_KEY:", supabaseAnonKey);
  throw new Error("Supabase environment variables are required");
}

// Singleton pattern for Supabase clients
let supabaseClient: ReturnType<typeof createClient> | null = null;
let supabaseAdminClient: ReturnType<typeof createClient> | null = null;

// Client-side Supabase client (limited permissions)
export const getSupabaseClient = () => {
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseClient;
};

// Server-side admin client (full permissions)
export const getSupabaseAdminClient = () => {
  if (!supabaseAdminClient) {
    if (!supabaseServiceKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is missing");
      throw new Error("Supabase service role key is required for admin client");
    }
    supabaseAdminClient = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabaseAdminClient;
};

// Types for our database tables
export type Profile = {
  id: string
  wallet_address?: string
  email?: string
  username: string
  avatar_url?: string
  bio?: string
  created_at: string
  updated_at?: string
}

export type Item = {
  id: string
  owner_id: string
  title: string
  description: string
  image_url?: string
  condition: "new" | "like_new" | "good" | "fair" | "poor"
  available: boolean
  created_at: string
  updated_at: string
}

export type BorrowRequest = {
  id: string
  item_id: string
  borrower_id: string
  status: "pending" | "approved" | "rejected" | "returned" | "conflict"
  start_date: string
  end_date: string
  created_at: string
  updated_at: string
}

export type Conflict = {
  id: string
  borrow_request_id: string
  reporter_id: string
  description: string
  status: "open" | "resolved"
  resolution?: string
  created_at: string
  updated_at: string
}
