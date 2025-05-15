import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET() {
  try {
    // Create the items bucket if it doesn't exist
    const { data: buckets, error: bucketsError } = await supabaseAdmin.storage.listBuckets()

    if (bucketsError) throw bucketsError

    const itemsBucketExists = buckets.some((bucket) => bucket.name === "items")

    if (!itemsBucketExists) {
      const { error: createBucketError } = await supabaseAdmin.storage.createBucket("items", {
        public: true, // Make the bucket public
        fileSizeLimit: 5242880, // 5MB in bytes
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      })

      if (createBucketError) throw createBucketError
    }

    // Set public bucket policy
    const { error: policyError } = await supabaseAdmin.storage.updateBucket("items", {
      public: true,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      fileSizeLimit: 5242880, // 5MB in bytes
    })

    if (policyError) throw policyError

    return NextResponse.json({ success: true, message: "Storage bucket initialized successfully" })
  } catch (error) {
    console.error("Error initializing storage bucket:", error)
    return NextResponse.json({ success: false, error: "Failed to initialize storage bucket" }, { status: 500 })
  }
}
