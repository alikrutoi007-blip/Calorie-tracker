alter table public.meal_captures
add column if not exists summary text,
add column if not exists storage_path text,
add column if not exists date_key text;
