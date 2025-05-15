"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { getSupabaseClient, type Item } from "@/lib/supabase"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "@/hooks/use-toast"
import { ImageUpload } from "@/components/image-upload"

interface ItemFormProps {
  item?: Item
  isEditing?: boolean
}

export function ItemForm({ item, isEditing = false }: ItemFormProps) {
  const { user } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<Partial<Item>>({
    title: item?.title || "",
    description: item?.description || "",
    condition: item?.condition || "good",
    available: item?.available ?? true,
    image_url: item?.image_url || "",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSwitchChange = (checked: boolean) => {
    setFormData((prev) => ({ ...prev, available: checked }))
  }

  const handleRadioChange = (value: string) => {
    setFormData((prev) => ({ ...prev, condition: value as Item["condition"] }))
  }

  const handleImageChange = (url: string) => {
    setFormData((prev) => ({ ...prev, image_url: url }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id) return

    setLoading(true)
    try {
      const supabase = getSupabaseClient()
      const now = new Date().toISOString()

      if (isEditing && item?.id) {
        // Update existing item
        const { error } = await supabase
          .from("items")
          .update({
            ...formData,
            updated_at: now,
          })
          .eq("id", item.id)
          .eq("owner_id", user.id) // Ensure user owns the item

        if (error) throw error
        toast({
          title: "Item updated",
          description: "Your item has been updated successfully.",
        })
      } else {
        // Create new item
        const { error } = await supabase.from("items").insert({
          ...formData,
          owner_id: user.id,
          created_at: now,
          updated_at: now,
        })

        if (error) throw error
        toast({
          title: "Item created",
          description: "Your item has been created successfully.",
        })
      }

      // Redirect to dashboard
      router.push("/dashboard")
      router.refresh()
    } catch (error) {
      console.error("Error saving item:", error)
      toast({
        title: "Error",
        description: "Failed to save item. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "Edit Item" : "Add New Item"}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              placeholder="What are you sharing?"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              placeholder="Describe your item in detail"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Item Image</Label>
            <ImageUpload value={formData.image_url || ""} onChange={handleImageChange} disabled={loading} />
            <p className="text-xs text-muted-foreground">Upload an image of your item (max 5MB)</p>
          </div>
          <div className="space-y-2">
            <Label>Condition</Label>
            <RadioGroup
              value={formData.condition}
              onValueChange={handleRadioChange}
              className="flex flex-col space-y-1"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="new" id="condition-new" />
                <Label htmlFor="condition-new" className="font-normal">
                  New
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="like_new" id="condition-like-new" />
                <Label htmlFor="condition-like-new" className="font-normal">
                  Like New
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="good" id="condition-good" />
                <Label htmlFor="condition-good" className="font-normal">
                  Good
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="fair" id="condition-fair" />
                <Label htmlFor="condition-fair" className="font-normal">
                  Fair
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="poor" id="condition-poor" />
                <Label htmlFor="condition-poor" className="font-normal">
                  Poor
                </Label>
              </div>
            </RadioGroup>
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="available" checked={formData.available} onCheckedChange={handleSwitchChange} />
            <Label htmlFor="available" className="font-normal">
              Available for borrowing
            </Label>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : isEditing ? "Update Item" : "Add Item"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
