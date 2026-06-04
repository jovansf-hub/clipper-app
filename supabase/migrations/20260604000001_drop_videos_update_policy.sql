-- H4 final: drop videos UPDATE policy. All writes now go through authenticated
-- server endpoints (upload/complete, videos/[id]/retry, process) via admin client.
-- Client (user JWT) can no longer UPDATE videos directly.
DROP POLICY IF EXISTS "Users can update own videos" ON videos;
