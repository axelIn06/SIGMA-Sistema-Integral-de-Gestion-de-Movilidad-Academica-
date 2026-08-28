-- Sincroniza ajustes añadidos después de que la migración de endurecimiento
-- inicial ya había sido registrada en Supabase Cloud. Todas las operaciones
-- son idempotentes para que instalaciones nuevas y existentes converjan.

revoke all on function public.assign_default_student_access(uuid)
  from public, anon, authenticated;
revoke all on function public.bootstrap_global_admin()
  from public, anon, authenticated;
revoke all on function public.set_call_updated_at()
  from public, anon, authenticated;
revoke all on function public.set_application_updated_at()
  from public, anon, authenticated;
revoke all on function public.validate_application_submission()
  from public, anon, authenticated;

revoke all on function public.admin_upsert_call(jsonb) from public, anon;
revoke all on function public.admin_delete_call(uuid) from public, anon;
revoke all on function public.student_save_application_draft(jsonb)
  from public, anon;
revoke all on function public.student_submit_application(uuid)
  from public, anon;

grant execute on function public.admin_upsert_call(jsonb) to authenticated;
grant execute on function public.admin_delete_call(uuid) to authenticated;
grant execute on function public.student_save_application_draft(jsonb)
  to authenticated;
grant execute on function public.student_submit_application(uuid)
  to authenticated;

create index if not exists user_roles_assigned_by_idx
  on public.user_roles(assigned_by);
create index if not exists calls_created_by_idx
  on public.calls(created_by);
create index if not exists application_documents_requirement_id_idx
  on public.application_documents(requirement_id);
