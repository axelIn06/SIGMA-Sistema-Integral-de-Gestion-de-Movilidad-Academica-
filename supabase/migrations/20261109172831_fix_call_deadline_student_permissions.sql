-- FOR SHARE applies the UPDATE policies on calls. Keep the lock without
-- granting applicants UPDATE access: only the private trigger runs as owner.
-- The original function uses an empty search_path and qualified table names.
alter function private.guard_call_deadline() security definer;
revoke all on function private.guard_call_deadline() from public, anon, authenticated;
