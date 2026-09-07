alter table public.applications drop constraint applications_status_check;
alter table public.applications add constraint applications_status_check check (status in (
 'BORRADOR','ENVIADA','EN_REVISION_DOCUMENTAL','OBSERVADA','APROBADA_OCRI','RECHAZADA','FINALIZADA',
 'NOMINADO_UNSAAC','EN_EVALUACION_DESTINO','ACEPTADO','NO_ACEPTADO_DESTINO','EN_MOVILIDAD','CANCELADO'
));
create table public.acceptance_letters (
 application_id uuid primary key references public.applications(id) on delete cascade,
 storage_path text not null,
 file_name text not null,
 status text not null default 'PENDIENTE' check(status in ('PENDIENTE','OBSERVADA','VALIDADA')),
 comment text not null default '',
 updated_at timestamptz not null default now()
);
alter table public.acceptance_letters enable row level security;
grant select on public.acceptance_letters to authenticated;
create policy "read own acceptance letter" on public.acceptance_letters for select to authenticated
 using(public.has_role('ADMIN_OCRI') or exists(select 1 from public.applications a where a.id=application_id and a.applicant_id=auth.uid()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('acceptance-letters','acceptance-letters',false,10485760,array['application/pdf']);
create policy "read acceptance files" on storage.objects for select to authenticated using(
 bucket_id='acceptance-letters' and exists(select 1 from public.applications a where a.id::text=split_part(name,'/',1) and (a.applicant_id=auth.uid() or public.has_role('ADMIN_OCRI'))));
create policy "upload acceptance files" on storage.objects for insert to authenticated with check(
 bucket_id='acceptance-letters' and exists(select 1 from public.applications a join public.calls c on c.id=a.call_id where a.id::text=split_part(name,'/',1) and (
 public.has_role('ADMIN_OCRI') and a.status in ('APROBADA_OCRI','NOMINADO_UNSAAC','EN_EVALUACION_DESTINO','ACEPTADO')
 or a.applicant_id=auth.uid() and c.direction='SALIENTE' and a.status in ('NOMINADO_UNSAAC','EN_EVALUACION_DESTINO')
 )));
create function public.save_acceptance_letter(target uuid, path text, filename text) returns void
language plpgsql security definer set search_path=public as $$
declare a public.applications; direction_value text;
begin
 select * into a from public.applications where id=target for update;
 select direction into direction_value from public.calls where id=a.call_id;
 if auth.uid() is null or not coalesce((
 public.has_role('ADMIN_OCRI') and a.status in ('APROBADA_OCRI','NOMINADO_UNSAAC','EN_EVALUACION_DESTINO','ACEPTADO')
 or a.applicant_id=auth.uid() and direction_value='SALIENTE' and a.status in ('NOMINADO_UNSAAC','EN_EVALUACION_DESTINO')
 ),false) then raise exception 'No autorizado para adjuntar la carta en esta etapa'; end if;
 if split_part(path,'/',1)<>target::text or not exists(select 1 from storage.objects where bucket_id='acceptance-letters' and name=path) then raise exception 'Archivo no encontrado'; end if;
 insert into public.acceptance_letters(application_id,storage_path,file_name,status) values(target,path,filename,'PENDIENTE')
 on conflict(application_id) do update set storage_path=excluded.storage_path,file_name=excluded.file_name,status='PENDIENTE',comment='',updated_at=now();
end $$;
create function public.review_acceptance_letter(target uuid, approved boolean, feedback text default '') returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.has_role('ADMIN_OCRI') then raise exception 'Solo OCRI puede revisar'; end if;
 perform 1 from public.applications where id=target and status in ('APROBADA_OCRI','NOMINADO_UNSAAC','EN_EVALUACION_DESTINO','ACEPTADO') for update;
 if not found then raise exception 'Etapa no válida'; end if;
 update public.acceptance_letters set status=case when approved then 'VALIDADA' else 'OBSERVADA' end,comment=coalesce(feedback,''),updated_at=now() where application_id=target;
 if not found then raise exception 'Primero adjunte una carta'; end if;
 if approved then update public.applications set status='ACEPTADO' where id=target; end if;
end $$;
revoke all on function public.save_acceptance_letter(uuid,text,text) from public,anon;
revoke all on function public.review_acceptance_letter(uuid,boolean,text) from public,anon;
grant execute on function public.save_acceptance_letter(uuid,text,text) to authenticated;
grant execute on function public.review_acceptance_letter(uuid,boolean,text) to authenticated;
