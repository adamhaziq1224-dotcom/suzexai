-- RLS policies call these private functions as the authenticated role.
-- Private schema access keeps them outside the Data API while the narrow
-- grants allow PostgreSQL to evaluate the policies safely.
grant usage on schema private to authenticated;
grant execute on function private.can_access_event(uuid), private.can_manage_event(uuid) to authenticated;

