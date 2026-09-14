-- El retiro directo solo es posible antes de que OCRI inicie la revisión.
-- Desde una nominación o aceptación, el desistimiento se tramita formalmente
-- con OCRI y no puede ser automatizado por la persona postulante.
create function public.student_withdraw_postulated_application(target_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para retirar una postulación.' using errcode = '42501';
  end if;

  update public.applications application
  set status = 'CANCELADO'
  from public.calls call
  where application.id = target_application_id
    and application.applicant_id = auth.uid()
    and application.status = 'ENVIADA'
    and call.id = application.call_id
    and call.direction = 'SALIENTE';

  if not found then
    raise exception 'Solo puedes retirar tu postulación mientras figure como Postulado y antes de la revisión de OCRI.'
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.student_withdraw_postulated_application(uuid) from public, anon;
grant execute on function public.student_withdraw_postulated_application(uuid) to authenticated;
