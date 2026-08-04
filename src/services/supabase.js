import { createClient }
from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env
    .VITE_SUPABASE_URL=https:https://lbkpsujhaoydhjxntjda.supabase.co

const supabaseAnonKey =
  import.meta.env
    .VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxia3BzdWpoYW95ZGhqeG50amRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NTA0MjIsImV4cCI6MjEwMTQyNjQyMn0.dybAVHxcD_JT-XlR2hnRDSyQmr9nntQeKKRn3IarseM;

export const supabase =
  createClient(
    supabaseUrl,
    supabaseAnonKey
  );
