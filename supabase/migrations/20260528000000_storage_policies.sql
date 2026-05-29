-- Storage policies for videos bucket
-- NOTE: Run in Supabase SQL Editor.
-- First create the bucket: Storage → New bucket → name "videos", enable RLS

CREATE POLICY "Users can upload to own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own videos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own videos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Add caption style selection to videos table
ALTER TABLE videos ADD COLUMN IF NOT EXISTS caption_style_requested text NOT NULL DEFAULT 'tiktok_highlight';
