-- A auto-edição da "pessoa" não pode mover a linha para uma casa da qual o usuário não faz parte.
alter policy household_members_update_self on public.household_members
  with check (user_id = (select auth.uid()) and public.is_member(household_id));
