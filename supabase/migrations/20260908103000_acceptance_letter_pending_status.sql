-- La carta pendiente es una etapa visible del flujo: separa la evaluación de
-- destino de la carga y validación del PDF por parte del estudiante y OCRI.
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check check (status in (
  'BORRADOR', 'ENVIADA', 'EN_REVISION_DOCUMENTAL', 'OBSERVADA', 'APROBADA_OCRI',
  'RECHAZADA', 'FINALIZADA', 'NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO',
  'CARTA_PENDIENTE', 'ACEPTADO', 'NO_ACEPTADO_DESTINO', 'EN_MOVILIDAD', 'CANCELADO'
));

drop policy if exists "upload acceptance files" on storage.objects;
create policy "upload acceptance files" on storage.objects for insert to authenticated with check(
  bucket_id='acceptance-letters' and exists(select 1 from public.applications a join public.calls c on c.id=a.call_id where a.id::text=split_part(name,'/',1) and (
    public.has_role('ADMIN_OCRI') and a.status in ('APROBADA_OCRI','NOMINADO_UNSAAC','EN_EVALUACION_DESTINO','CARTA_PENDIENTE','ACEPTADO')
    or a.applicant_id=auth.uid() and c.direction='SALIENTE' and a.status in ('NOMINADO_UNSAAC','EN_EVALUACION_DESTINO','CARTA_PENDIENTE')
  ))
);

create or replace function public.save_acceptance_letter(target uuid, path text, filename text)
returns void
language plpgsql security definer set search_path=public as $$
declare a public.applications; direction_value text;
begin
  select * into a from public.applications where id=target for update;
  select direction into direction_value from public.calls where id=a.call_id;
  if auth.uid() is null or not coalesce((
    public.has_role('ADMIN_OCRI') and a.status in ('APROBADA_OCRI','NOMINADO_UNSAAC','EN_EVALUACION_DESTINO','CARTA_PENDIENTE','ACEPTADO')
    or a.applicant_id=auth.uid() and direction_value='SALIENTE' and a.status in ('NOMINADO_UNSAAC','EN_EVALUACION_DESTINO','CARTA_PENDIENTE')
  ),false) then raise exception 'No autorizado para adjuntar la carta en esta etapa'; end if;
  if split_part(path,'/',1)<>target::text or not exists(select 1 from storage.objects where bucket_id='acceptance-letters' and name=path) then raise exception 'Archivo no encontrado'; end if;
  insert into public.acceptance_letters(application_id,storage_path,file_name,status) values(target,path,filename,'PENDIENTE')
  on conflict(application_id) do update set storage_path=excluded.storage_path,file_name=excluded.file_name,status='PENDIENTE',comment='',updated_at=now();
end $$;

create or replace function public.review_acceptance_letter(target uuid, approved boolean, feedback text default '')
returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.has_role('ADMIN_OCRI') then raise exception 'Solo OCRI puede revisar'; end if;
  perform 1 from public.applications where id=target and status in ('APROBADA_OCRI','NOMINADO_UNSAAC','EN_EVALUACION_DESTINO','CARTA_PENDIENTE','ACEPTADO') for update;
  if not found then raise exception 'Etapa no válida'; end if;
  update public.acceptance_letters set status=case when approved then 'VALIDADA' else 'OBSERVADA' end,comment=coalesce(feedback,''),updated_at=now() where application_id=target;
  if not found then raise exception 'Primero adjunte una carta'; end if;
  if approved then update public.applications set status='ACEPTADO' where id=target; end if;
end $$;

-- El gestor/profesor externo solo puede consultar expedientes entrantes de su
-- propia universidad. Así puede acompañar al estudiante sin acceso transversal.
create function public.external_manager_can_read_application(target_application_id uuid)
returns boolean
language sql stable security definer set search_path=public as $$
  select public.has_role('GESTOR_EXTERNO') and exists (
    select 1
    from public.applications application
    join public.profiles manager on manager.user_id = auth.uid()
    join public.profiles applicant on applicant.user_id = application.applicant_id
    join public.calls call on call.id = application.call_id
    where application.id = target_application_id
      and manager.university_id = applicant.university_id
      and call.direction = 'ENTRANTE'
  );
$$;
revoke all on function public.external_manager_can_read_application(uuid) from public, anon;
grant execute on function public.external_manager_can_read_application(uuid) to authenticated;

create policy "external managers read affiliated incoming applications"
  on public.applications for select to authenticated
  using (public.external_manager_can_read_application(id));

create policy "external managers read affiliated incoming documents"
  on public.application_documents for select to authenticated
  using (public.external_manager_can_read_application(application_id));

create policy "external managers read affiliated application history"
  on public.application_status_history for select to authenticated
  using (public.external_manager_can_read_application(application_id));

create policy "external managers read affiliated applicant profiles"
  on public.profiles for select to authenticated
  using (exists (select 1 from public.applications application where application.applicant_id = profiles.user_id and public.external_manager_can_read_application(application.id)));

create policy "external managers read affiliated applicant photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and exists (select 1 from public.profiles applicant join public.applications application on application.applicant_id = applicant.user_id where applicant.photo_path = storage.objects.name and public.external_manager_can_read_application(application.id))
  );

create policy "external managers read affiliated application files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'application-documents'
    and public.external_manager_can_read_application((storage.foldername(name))[2]::uuid)
  );
