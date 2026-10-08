# Wurfbilder im Zentralspeicher einrichten

Im Reiter **«Wurfbilder»** lassen sich Würfe erfassen (an der Linie oder am Video), auswerten und für die Torhüter-Vorbereitung auf den nächsten Gegner nutzen. Damit alle Angemeldeten dieselben Würfe sehen und gemeinsam erfassen können, braucht der Zentralspeicher **eine zusätzliche Tabelle**. Das machst du **einmalig**, es dauert etwa eine Minute.

Bis die Tabelle eingerichtet ist, speichert das Tool die Würfe nur im Browser, in dem sie erfasst wurden. Sie lassen sich später mit einem Knopf in den Zentralspeicher übertragen.

## Schritte

1. Öffne https://supabase.com und melde dich an.
2. Wähle dein Projekt (dasselbe wie für die Spielerübersicht Stäfa).
3. Klicke links auf **«SQL Editor»** und dann auf **«New query»**.
4. Kopiere den ganzen Text unten in das Feld und klicke auf **«Run»**.
5. Unten sollte «Success. No rows returned» stehen. Fertig.

Danach die Website neu laden (Ctrl+F5) und im Reiter «Spielerübersicht Stäfa» anmelden. Im Reiter «Wurfbilder» steht dann «Die Würfe werden im Zentralspeicher gespeichert».

Voraussetzung: Die Funktionen `ich()`, `ist_person()` und `ist_sicherung()` aus **ANLEITUNG-MERKLISTE.md**. Falls du diese Anleitung noch nicht ausgeführt hast, legt der Text unten die nötigen Funktionen selbst an.

## Text für den SQL Editor

```sql
-- Wurfbilder für das Handball-Scouting

-- Hilfsfunktionen (gleich wie bei den Merklisten, schadet nicht doppelt)
create or replace function public.ich() returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;
create or replace function public.ist_person() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from personen p where lower(p.email) = public.ich())
$$;
create or replace function public.ist_sicherung() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from personen p where lower(p.email) = public.ich() and lower(coalesce(p.rolle, '')) = 'sicherung')
$$;
grant execute on function public.ist_person() to authenticated;
grant execute on function public.ist_sicherung() to authenticated;

-- Ein Eintrag pro Wurf
create table if not exists public.wuerfe (
  id              bigint generated always as identity primary key,
  game_id         bigint      not null,
  spiel           text        not null default '',
  datum           text        not null default '',
  liga            text        not null default '',
  angriff_team_id bigint,
  angriff_team    text        not null default '',
  player_id       bigint,                         -- Werfer (leer = unbekannt)
  spieler         text        not null default '',
  nr              smallint,
  tw_id           bigint,                         -- Torhüter (leer = unbekannt)
  tw_name         text        not null default '',
  tw_team         text        not null default '',
  x               real,                           -- Wurfposition auf dem Feld (0–200 breit, 0–140 tief)
  y               real,
  gx              real,                           -- Ziel im Tor (0–300 breit, 0–200 hoch, Sicht Werfer)
  gy              real,
  zone            text        not null default '',   -- LA, RL, RM, RR, RA, KM, 7M
  tor_zone        text,                              -- ol, om, or, ml, mm, mr, ul, um, ur
  ergebnis        text        not null check (ergebnis in ('tor', 'parade', 'pfosten', 'vorbei', 'block')),
  situation       text        not null default 'position' check (situation in ('position', 'gegenstoss', '7m')),
  art             text,
  erfasst_von     text        not null default '',
  erfasst_am      timestamptz not null default now()
);
create index if not exists wuerfe_game on public.wuerfe (game_id);
create index if not exists wuerfe_player on public.wuerfe (player_id);
create index if not exists wuerfe_tw on public.wuerfe (tw_id);

-- Zugriffsregeln: Alle freigeschalteten Personen dürfen lesen, erfassen und löschen
alter table public.wuerfe enable row level security;
drop policy if exists "wuerfe lesen" on public.wuerfe;
drop policy if exists "wuerfe erfassen" on public.wuerfe;
drop policy if exists "wuerfe loeschen" on public.wuerfe;
drop policy if exists "sicherung wuerfe" on public.wuerfe;
create policy "wuerfe lesen"     on public.wuerfe for select to authenticated using (public.ist_person());
create policy "wuerfe erfassen"  on public.wuerfe for insert to authenticated with check (public.ist_person());
create policy "wuerfe loeschen"  on public.wuerfe for delete to authenticated using (public.ist_person());
create policy "sicherung wuerfe" on public.wuerfe for select to authenticated using (public.ist_sicherung());
```

## So funktioniert der Reiter

- **Erfassen:** Spiel wählen (kommende Spiele aus dem Spielplan für die Erfassung an der Linie, gespielte Spiele für das Video). Dann pro Wurf: Werfer antippen, Position auf dem Feld antippen, Ziel im Tor antippen, Ergebnis antippen. Mit dem Ergebnis ist der Wurf gespeichert. Bei «Vorbei» und «Geblockt» braucht es kein Ziel im Tor. Wer im Tor steht, wählst du oben einmal aus (bei Wechsel neu wählen).
- **Auswertung:** pro Werfer, pro Torhüter (auch die eigenen) oder pro Team. Zeigt, wohin geworfen wird (3×3 Felder im Tor), von wo, und Tendenzen in Worten. Das Tor lässt sich aus Sicht Torhüter (gespiegelt) oder aus Sicht Werfer zeigen.
- **Gegner-Vorbereitung:** wählt einen Gegner und zeigt seine besten Werfer mit Statistik und Torbild. Mit «Als PDF für den Torhüter» entsteht ein Blatt zum Mitgeben.
- Standard sind nur QHL- und NLB-Spiele. Mit «alle Ligen» lassen sich auch andere Spiele erfassen.

## Gut zu wissen

- **Wer darf?** Alle Personen aus der Tabelle «personen», also dieselben wie für die Spielerübersicht Stäfa. Alle sehen alle Würfe.
- **Falsch erfasst?** In der Liste «Würfe in diesem Spiel» mit ✕ löschen und neu erfassen.
- **Sicherung:** Die wöchentliche Sicherung nimmt die Würfe mit, sobald die Tabelle eingerichtet ist.
- Der Text lässt sich gefahrlos ein zweites Mal ausführen, bestehende Würfe bleiben erhalten.
