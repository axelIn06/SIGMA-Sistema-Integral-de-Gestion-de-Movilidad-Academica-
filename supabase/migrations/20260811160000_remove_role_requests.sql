-- OCRI designa gestores externos directamente: los usuarios no solicitan roles.
revoke execute on function public.admin_decide_role_request(uuid, boolean, text) from authenticated;
drop function public.admin_decide_role_request(uuid, boolean, text);
drop table public.role_change_requests cascade;
drop function public.validate_role_change_request();
drop type public.role_request_status;
