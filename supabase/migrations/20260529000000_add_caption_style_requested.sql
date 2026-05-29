-- Dodaj caption_style_requested polje u videos tabelu
ALTER TABLE videos
ADD COLUMN IF NOT EXISTS caption_style_requested text DEFAULT 'tiktok_highlight';

-- Dodaj komentar za jasnoću
COMMENT ON COLUMN videos.caption_style_requested IS 'User selected caption style at upload time. Different from clips.caption_style which can vary per clip.';
