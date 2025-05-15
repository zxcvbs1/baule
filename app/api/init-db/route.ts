import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET() {
  try {
    // Create profiles table
    await supabaseAdmin.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        wallet_address TEXT,
        email TEXT,
        username TEXT NOT NULL,
        avatar_url TEXT,
        bio TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE
      );
    `)

    // Create items table
    await supabaseAdmin.query(`
      CREATE TABLE IF NOT EXISTS items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        owner_id TEXT NOT NULL REFERENCES profiles(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        image_url TEXT,
        condition TEXT NOT NULL,
        available BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `)

    // Create borrow_requests table
    await supabaseAdmin.query(`
      CREATE TABLE IF NOT EXISTS borrow_requests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        item_id UUID NOT NULL REFERENCES items(id),
        borrower_id TEXT NOT NULL REFERENCES profiles(id),
        status TEXT NOT NULL,
        start_date TIMESTAMP WITH TIME ZONE NOT NULL,
        end_date TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `)

    // Create conflicts table
    await supabaseAdmin.query(`
      CREATE TABLE IF NOT EXISTS conflicts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        borrow_request_id UUID NOT NULL REFERENCES borrow_requests(id),
        reporter_id TEXT NOT NULL REFERENCES profiles(id),
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        resolution TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `)

    return NextResponse.json({ success: true, message: "Database initialized successfully" })
  } catch (error) {
    console.error("Error initializing database:", error)
    return NextResponse.json({ success: false, error: "Failed to initialize database" }, { status: 500 })
  }
}
