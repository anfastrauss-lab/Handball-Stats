# Merklisten im Zentralspeicher einrichten

Damit gibt es für alle, die sich in der «Spielerübersicht Stäfa» anmelden:

- **Meine Merkliste (privat):** Jede Person hat automatisch eine eigene Liste, die nur sie sieht, auf jedem Gerät gleich.
- **Team-Merklisten:** Jede Person kann weitere Listen anlegen (zum Beispiel «QHL Trainerteam») und bestimmt, wer Mitglied ist. Nur Mitglieder sehen die Liste.
- **Spieler schicken:** Ein Spielerprofil lässt sich mit einer kurzen Nachricht an eine andere Person schicken. Es erscheint bei ihr unter «Für dich empfohlen».

Dafür braucht der Zentralspeicher einige zusätzliche Tabellen. Das machst du **einmalig**, es dauert etwa zwei Minuten.

## Schritte

1. Öffne https://supabase.com und melde dich an.
2. Wähle dein Projekt (dasselbe wie für die Spielerübersicht Stäfa).
3. Klicke links auf **«SQL Editor»** und dann auf **«New query»**.
4. Kopiere den ganzen Text unten in das Feld und klicke auf **«Run»**.
5. Unten sollte «Success. No rows returned» stehen. Fertig.

Danach die Website einmal neu laden (Ctrl+F5) und im Reiter «Spielerübersicht Stäfa» anmelden. Im Reiter «Merkliste» kannst du dann Listen wählen und anlegen. Mit **«Merkliste aus diesem Browser übernehmen»** holst du deine bisherigen Einträge in die gewählte Liste.

## Text für den SQL Editor

```sql
-- Merklisten für das Handball-Scouting

-- Wer bin ich? (E-Mail aus der Anmeldung, klein geschrieben)
create or replace function public.ich() returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- Ist die angemeldete Person freigeschaltet (Tabelle «personen»)?
create or replace function public.ist_person() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from personen p where lower(p.email) = public.ich())
$$;

-- Listen
create table if not exists public.merklisten (
  id          bigint generated always as identity primary key,
  name        text        not null,
  art         text        not null default 'team' check (art in ('privat', 'team')),
  besitzer    text        not null,
  erstellt_am timestamptz not null default now()
);

-- Mitglieder einer Liste (E-Mail klein geschrieben)
create table if not exists public.merklisten_mitglieder (
  liste_id bigint not null references public.merklisten (id) on delete cascade,
  email    text   not null,
  primary key (liste_id, email)
);

-- Ist die angemeldete Person Mitglied dieser Liste?
create or replace function public.ist_mitglied(l bigint) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from merklisten_mitglieder m where m.liste_id = l and m.email = public.ich())
$$;

-- Einträge
create table if not exists public.merkliste (
  liste_id      bigint      not null references public.merklisten (id) on delete cascade,
  player_id     bigint      not null,
  rolle         text        not null check (rolle in ('F', 'G')),
  name          text        not null default '',
  status        text        not null default 'beobachten'
                check (status in ('beobachten', 'live', 'kontakt', 'probe', 'nein')),
  bewertung     smallint    check (bewertung between 1 and 5),
  notiz         text        not null default '',
  geaendert_von text        not null default '',
  geaendert_am  timestamptz not null default now(),
  primary key (liste_id, player_id, rolle)
);

-- Empfehlungen («Spieler schicken»)
create table if not exists public.empfehlungen (
  id          bigint generated always as identity primary key,
  an_email    text        not null,
  von_email   text        not null,
  von_name    text        not null default '',
  player_id   bigint      not null,
  rolle       text        not null check (rolle in ('F', 'G')),
  name        text        not null default '',
  nachricht   text        not null default '',
  erstellt_am timestamptz not null default now(),
  erledigt    boolean     not null default false
);

-- Namen aller freigeschalteten Personen (für «Mitglieder» und «Spieler schicken»)
create or replace function public.personen_namen() returns table (name text, email text) language sql stable security definer set search_path = public as $$
  select p.name, lower(p.email) from personen p where public.ist_person() order by p.name
$$;
grant execute on function public.personen_namen() to authenticated;
grant execute on function public.ist_mitglied(bigint) to authenticated;
grant execute on function public.ist_person() to authenticated;

-- Zugriffsregeln
alter table public.merklisten enable row level security;
alter table public.merklisten_mitglieder enable row level security;
alter table public.merkliste enable row level security;
alter table public.empfehlungen enable row level security;

drop policy if exists "listen lesen" on public.merklisten;
drop policy if exists "listen anlegen" on public.merklisten;
drop policy if exists "listen aendern" on public.merklisten;
drop policy if exists "listen loeschen" on public.merklisten;
create policy "listen lesen"   on public.merklisten for select to authenticated using (besitzer = public.ich() or public.ist_mitglied(id));
create policy "listen anlegen" on public.merklisten for insert to authenticated with check (besitzer = public.ich() and public.ist_person());
create policy "listen aendern" on public.merklisten for update to authenticated using (besitzer = public.ich()) with check (besitzer = public.ich());
create policy "listen loeschen" on public.merklisten for delete to authenticated using (besitzer = public.ich());

drop policy if exists "mitglieder lesen" on public.merklisten_mitglieder;
drop policy if exists "mitglieder verwalten" on public.merklisten_mitglieder;
drop policy if exists "mitglieder entfernen" on public.merklisten_mitglieder;
create policy "mitglieder lesen" on public.merklisten_mitglieder for select to authenticated
  using (public.ist_mitglied(liste_id) or exists (select 1 from public.merklisten l where l.id = liste_id and l.besitzer = public.ich()));
create policy "mitglieder verwalten" on public.merklisten_mitglieder for insert to authenticated
  with check (exists (select 1 from public.merklisten l where l.id = liste_id and l.besitzer = public.ich()));
create policy "mitglieder entfernen" on public.merklisten_mitglieder for delete to authenticated
  using (exists (select 1 from public.merklisten l where l.id = liste_id and l.besitzer = public.ich()) or email = public.ich());

drop policy if exists "eintraege" on public.merkliste;
create policy "eintraege" on public.merkliste for all to authenticated
  using (public.ist_mitglied(liste_id)) with check (public.ist_mitglied(liste_id));

drop policy if exists "empfehlungen lesen" on public.empfehlungen;
drop policy if exists "empfehlungen schicken" on public.empfehlungen;
drop policy if exists "empfehlungen erledigen" on public.empfehlungen;
drop policy if exists "empfehlungen loeschen" on public.empfehlungen;
create policy "empfehlungen lesen"     on public.empfehlungen for select to authenticated using (an_email = public.ich() or von_email = public.ich());
create policy "empfehlungen schicken"  on public.empfehlungen for insert to authenticated with check (von_email = public.ich() and public.ist_person());
create policy "empfehlungen erledigen" on public.empfehlungen for update to authenticated using (an_email = public.ich()) with check (an_email = public.ich());
create policy "empfehlungen loeschen"  on public.empfehlungen for delete to authenticated using (an_email = public.ich() or von_email = public.ich());

-- Wöchentliche Sicherung: Ein Zugang mit der Rolle «Sicherung» darf alles lesen (nicht ändern)
create or replace function public.ist_sicherung() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from personen p where lower(p.email) = public.ich() and lower(coalesce(p.rolle, '')) = 'sicherung')
$$;
grant execute on function public.ist_sicherung() to authenticated;
drop policy if exists "sicherung listen" on public.merklisten;
drop policy if exists "sicherung mitglieder" on public.merklisten_mitglieder;
drop policy if exists "sicherung eintraege" on public.merkliste;
drop policy if exists "sicherung empfehlungen" on public.empfehlungen;
create policy "sicherung listen"       on public.merklisten for select to authenticated using (public.ist_sicherung());
create policy "sicherung mitglieder"   on public.merklisten_mitglieder for select to authenticated using (public.ist_sicherung());
create policy "sicherung eintraege"    on public.merkliste for select to authenticated using (public.ist_sicherung());
create policy "sicherung empfehlungen" on public.empfehlungen for select to authenticated using (public.ist_sicherung());
```

## Sicherung

Die wöchentliche Sicherung (sonntags) nimmt die Merklisten mit, sobald die Tabellen eingerichtet sind. Damit sie **alle** Listen sieht und nicht nur eigene, braucht der Sicherungs-Zugang in der Tabelle **«personen»** bei **«rolle»** den Wert **«Sicherung»**:

1. In Supabase links auf **«Table Editor»**, dann auf die Tabelle **«personen»**.
2. In der Zeile des Sicherungs-Zugangs (die E-Mail, die im GitHub-Secret `SICHERUNG_EMAIL` steht) bei **rolle** «Sicherung» eintragen und speichern.

Der Sicherungs-Zugang kann die Merklisten damit nur lesen, nicht ändern. Im Protokoll des Sicherungslaufs steht danach z. B. «… 4 Merklisten mit 37 Einträgen». Das Zurückspielen der Merklisten aus einer Sicherung ist im Tool noch nicht eingebaut. Im Notfall lässt sich das von Hand erledigen.

## Gut zu wissen

- **Wer darf?** Nur Personen aus der Tabelle «personen», also dieselben wie für die Spielerübersicht Stäfa.
- **Private Liste:** wird beim ersten Öffnen der Merkliste automatisch angelegt und kann nicht gelöscht werden.
- **Team-Listen:** Nur wer eine Liste angelegt hat, kann sie umbenennen, löschen und Mitglieder bestimmen. Alle Mitglieder können Spieler hinzufügen, entfernen und Notizen, Status und Bewertung ändern.
- **Ohne Anmeldung** gibt es wie bisher eine Merkliste nur im eigenen Browser.
- **Sicherung:** siehe Abschnitt «Sicherung» oben.
- Der Text lässt sich gefahrlos ein zweites Mal ausführen, bestehende Einträge bleiben erhalten.
