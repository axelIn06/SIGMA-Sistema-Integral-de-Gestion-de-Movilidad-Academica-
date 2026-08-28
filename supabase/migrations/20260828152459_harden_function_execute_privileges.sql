-- Restringe los RPC SECURITY DEFINER a los roles que realmente los necesitan.
-- PostgreSQL concede EXECUTE a PUBLIC al crear una función; sin estas
-- revocaciones, PostgREST también puede exponer funciones internas a anon.

-- Funciones exclusivas de triggers y eventos internos. No son RPC públicas.
revoke all on function public.handle_new_user()
  from public, anon, authenticated;
revoke all on function public.sync_profile_email_confirmation()
  from public, anon, authenticated;
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

-- Helper usado por políticas RLS y funciones autenticadas.
revoke all on function public.has_role(text) from public, anon;
grant execute on function public.has_role(text) to authenticated;

-- RPC administrativas: cualquier cuenta autenticada puede invocar el endpoint,
-- pero cada función exige internamente el rol ADMIN_OCRI antes de mutar datos.
revoke all on function public.admin_set_user_role(uuid, text)
  from public, anon;
revoke all on function public.admin_set_account_status(uuid, public.account_status)
  from public, anon;
revoke all on function public.admin_create_university_with_domain(text, text, text)
  from public, anon;

grant execute on function public.admin_set_user_role(uuid, text)
  to authenticated;
grant execute on function public.admin_set_account_status(uuid, public.account_status)
  to authenticated;
grant execute on function public.admin_create_university_with_domain(text, text, text)
  to authenticated;

-- RPC de convocatorias y postulaciones. Las funciones también validan el rol,
-- la propiedad del registro y las políticas RLS antes de escribir.
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

-- Índices de claves foráneas que no estaban cubiertas por otros índices.
create index if not exists user_roles_assigned_by_idx
  on public.user_roles(assigned_by);
create index if not exists calls_created_by_idx
  on public.calls(created_by);
create index if not exists application_documents_requirement_id_idx
  on public.application_documents(requirement_id);

-- is_registration_domain_approved(text) permanece accesible a anon de forma
-- intencional: el formulario de registro valida el dominio antes de iniciar sesión.
