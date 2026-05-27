// Database types - placeholder until we generate from Supabase
// TODO: Run `npx supabase gen types typescript` after migration is applied

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          plan: "free" | "creator" | "pro";
          credits_remaining: number;
          credits_reset_at: string;
          default_caption_style: string;
          default_content_type: "podcast" | "interview" | "talk" | "tutorial" | "vlog";
          videos_processed_total: number;
          clips_generated_total: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string; email: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      videos: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          original_filename: string;
          file_path: string;
          file_size_bytes: number;
          duration_seconds: number;
          mime_type: string;
          status: "uploading" | "uploaded" | "transcribing" | "analyzing" | "clipping" | "completed" | "failed";
          error_message: string | null;
          error_step: string | null;
          transcript_text: string | null;
          transcript_segments: unknown | null;
          viral_analysis: unknown | null;
          credits_used: number;
          cost_breakdown: unknown | null;
          content_type: string;
          language: string;
          clip_count_requested: number;
          created_at: string;
          processing_started_at: string | null;
          processing_completed_at: string | null;
          expires_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["videos"]["Row"]> & {
          user_id: string;
          title: string;
          original_filename: string;
          file_path: string;
          file_size_bytes: number;
          duration_seconds: number;
          mime_type: string;
        };
        Update: Partial<Database["public"]["Tables"]["videos"]["Row"]>;
      };
      clips: {
        Row: {
          id: string;
          video_id: string;
          user_id: string;
          start_time_seconds: number;
          end_time_seconds: number;
          duration_seconds: number;
          title: string;
          description: string | null;
          suggested_hashtags: string[] | null;
          captions: unknown;
          caption_style: string;
          viral_score: number | null;
          viral_reasoning: string | null;
          output_path: string | null;
          output_url: string | null;
          thumbnail_path: string | null;
          thumbnail_url: string | null;
          file_size_bytes: number | null;
          aspect_ratio: string;
          face_detection_data: unknown | null;
          downloaded: boolean;
          downloaded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["clips"]["Row"]> & {
          video_id: string;
          user_id: string;
          start_time_seconds: number;
          end_time_seconds: number;
          duration_seconds: number;
          title: string;
          captions: unknown;
        };
        Update: Partial<Database["public"]["Tables"]["clips"]["Row"]>;
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          creem_customer_id: string | null;
          creem_subscription_id: string | null;
          creem_product_id: string | null;
          plan: "free" | "creator" | "pro";
          status: "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "paused";
          current_period_start: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          canceled_at: string | null;
          price_eur_per_month: number | null;
          currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]> & {
          user_id: string;
          plan: "free" | "creator" | "pro";
          status: "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "paused";
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]>;
      };
      usage_logs: {
        Row: {
          id: string;
          user_id: string;
          video_id: string | null;
          operation: "video_upload" | "transcription" | "ai_analysis" | "clip_generation" | "clip_download";
          credits_charged: number;
          duration_seconds_processed: number | null;
          cost_usd: number | null;
          cost_breakdown: unknown | null;
          service_provider: string | null;
          service_model: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["usage_logs"]["Row"]> & {
          user_id: string;
          operation: "video_upload" | "transcription" | "ai_analysis" | "clip_generation" | "clip_download";
        };
        Update: Partial<Database["public"]["Tables"]["usage_logs"]["Row"]>;
      };
      caption_styles: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          font_family: string;
          font_size: number;
          font_weight: number;
          text_color: string;
          highlight_color: string | null;
          background_color: string | null;
          stroke_color: string | null;
          stroke_width: number;
          animation_type: "none" | "word_highlight" | "word_pop" | "karaoke" | null;
          position: string;
          margin_bottom_percent: number;
          is_free: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["caption_styles"]["Row"]> & { id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["caption_styles"]["Row"]>;
      };
    };
  };
};
