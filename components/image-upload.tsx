"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { getSupabaseClient } from "@/lib/supabase"
import { toast } from "@/hooks/use-toast"
import { Loader2, Upload, X } from "lucide-react"
import Image from "next/image"
import { v4 as uuidv4 } from "uuid"

interface ImageUploadProps {
  value: string
  onChange: (url: string) => void
  disabled?: boolean
}

export function ImageUpload({ value, onChange, disabled }: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (JPEG, PNG, etc.)",
        variant: "destructive",
      })
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Image size should be less than 5MB",
        variant: "destructive",
      })
      return
    }

    setIsUploading(true)

    try {
      const supabase = getSupabaseClient()

      // Generate a unique filename to prevent collisions
      const fileExt = file.name.split(".").pop()
      const fileName = `${uuidv4()}.${fileExt}`
      const filePath = `item-images/${fileName}`

      // Upload the file to Supabase Storage
      const { error: uploadError, data } = await supabase.storage.from("items").upload(filePath, file)

      if (uploadError) throw uploadError

      // Get the public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("items").getPublicUrl(filePath)

      onChange(publicUrl)

      toast({
        title: "Image uploaded",
        description: "Your image has been uploaded successfully",
      })
    } catch (error) {
      console.error("Error uploading image:", error)
      toast({
        title: "Upload failed",
        description: "There was an error uploading your image. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleRemove = () => {
    onChange("")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || disabled}
          className="flex items-center gap-2"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Upload Image
            </>
          )}
        </Button>
        {value && (
          <Button
            type="button"
            variant="outline"
            onClick={handleRemove}
            disabled={isUploading || disabled}
            className="flex items-center gap-2 text-destructive"
          >
            <X className="h-4 w-4" />
            Remove
          </Button>
        )}
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleUpload}
          className="hidden"
          disabled={isUploading || disabled}
        />
      </div>

      {value && (
        <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border">
          <Image
            src={value || "/placeholder.svg"}
            alt="Item image"
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
      )}
    </div>
  )
}
