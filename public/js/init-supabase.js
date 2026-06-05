// init-supabase.js
const SUPABASE_URL = "https://bcmxaqrjpelpfxafrtqu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjbXhhcXJqcGVscGZ4YWZydHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDExNzgsImV4cCI6MjA4MzUxNzE3OH0.3CtMMsv2c7fbLgC8-wd17ppyfhK31WRnhBT2CIVGyYY";

// グローバルに公開
window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);