import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://htveuwyqfkiqsvpbceet.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0dmV1d3lxZmtpcXN2cGJjZWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjQ0NjAsImV4cCI6MjEwMDIwMDQ2MH0.yF7ONuwUL1PGWBxHMV6j4mUqgche1fxPzVZmz7zQygA'

export const supabase = createClient(supabaseUrl, supabaseKey)
