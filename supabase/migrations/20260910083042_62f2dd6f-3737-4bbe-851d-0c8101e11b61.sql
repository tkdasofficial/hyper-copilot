CREATE POLICY "own video files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own video files insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own video files update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own video files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "video files service role" ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'videos') WITH CHECK (bucket_id = 'videos');