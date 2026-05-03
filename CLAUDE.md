# Energetika PWA — kontext pro AI agenty

> **Tento soubor čte Claude Code automaticky při každé session.** Obsahuje vše, co agenti potřebují vědět o projektu, aby ti dávali smysluplné odpovědi.

## O projektu

**Energetika PWA** je webová aplikace pro majitele fotovoltaických elektráren s bateriovým úložištěm (ESS) a elektromobilem. Aplikace zobrazuje data z FVE, řídí ESS přes Node-RED a optimalizuje spotřebu podle spotových cen elektřiny z OTE-CR.

**Cíl projektu:** Z funkčního prototypu udělat distribuovatelný produkt pro majitele FVE s ESS systémem (primárně Victron, do budoucna i další).

**Cílový uživatel:** Majitel rodinného domu s FVE (5-30 kWp), bateriovým úložištěm a často i elektromobilem. Technicky zdatný, ale ne programátor.

## Aktuální stav

- ✅ Funkční beta — data tečou, Node-RED řídí ESS
- ✅ Deploy na Vercel funguje
- ⚠️ UI prochází redesignem
- ❌ Chybí robustní error handling
- ❌ Není multiuživatelská (1 instalace = 1 uživatel)
- ❌ Žádné testy
- ❌ Vše v jednom `index.html` (~10 000 řádků)

## Tech stack (současný)

| Vrstva | Technologie | Poznámka |
|---|---|---|
| Frontend | Vanilla JS + HTML/CSS | Jeden soubor `index.html` |
| Backend | Vercel Serverless Functions (Node.js) | `/api/*.js` endpointy |
| Databáze | Vercel Edge Config | Klíč-hodnota pro `rules` |
| Hosting | Vercel | GitHub push → auto-deploy |
| Grafy | Chart.js 4.4 | CDN, bez bundleru |
| Automatizace | Node-RED na Cerbo GX | MQTT/D-Bus pro Victron ESS |
| Externí data | OTE-CR API, Victron VRM API | Přes Vercel proxy |

## Tech stack (cílový)

| Vrstva | Cíl | Důvod |
|---|---|---|
| Frontend | React + TypeScript + Vite | Komponenty, type safety |
| Styling | Tailwind CSS | Rychlejší vývoj, konzistence |
| Stav | Zustand nebo TanStack Query | Lehké, dostatečné |
| Databáze | Vercel KV (Redis) nebo Supabase | Multi-tenant ready |
| Auth | Clerk nebo Supabase Auth | Když přijde multi-user |
| Testy | Vitest + Playwright | Unit + E2E |
| Monitoring | Sentry | Error tracking v produkci |

## Konvence a pravidla

### Kdo má poslední slovo
**Vlastník projektu (uživatel) je product owner a hlavní tester.** Agenti navrhují, on rozhoduje. Žádný agent nesmí:
- Provádět velké refaktory bez schválení
- Měnit architekturu bez diskuze
- Přidávat dependencies bez vysvětlení proč
- Mazat nebo přepisovat funkční kód bez varování

### Jazyk
- **Komentáře v kódu:** anglicky
- **Dokumentace, commity, komunikace s userem:** česky
- **Názvy proměnných/funkcí:** anglicky

### Git workflow
- Každá větší změna = nová branch
- Commit messages v češtině, formát: `typ: krátký popis` (např. `feat: přidán graf spotřeby baterie`)
- Před mergem do `main` projít s userem

### Bezpečnost
- API klíče (Victron VRM, OTE-CR) **nikdy** nesmí být v kódu, vždy v `.env`
- Před commitem zkontrolovat, že `.env` je v `.gitignore`
- Multi-tenant implementace musí izolovat data uživatelů

## Doménová specifika (FVE / ESS)

Agenti musí rozumět těmto pojmům — pokud si nejsou jistí, **zeptají se uživatele**, nikdy si nevymýšlejí:

- **FVE** — fotovoltaická elektrárna
- **ESS** — Energy Storage System (bateriové úložiště)
- **SoC** — State of Charge (stav nabití baterie v %)
- **Spotová cena** — hodinová cena elektřiny z OTE-CR
- **Distributor** — ČEZ / EG.D / PRE (různé tarify a sazby)
- **Tarif** — D02d, D25d, D26d, D57d (každý má jiné podmínky)
- **Přetoky** — energie z FVE poslaná zpět do sítě
- **VRM** — Victron Remote Management (cloud Victronu)
- **Node-RED** — vizuální nástroj pro automatizaci, běží na Cerbo GX
- **Cerbo GX** — řídicí jednotka Victron ESS

## Roadmap (priorita shora dolů)

1. **Stabilizace** — error handling, logging, základní testy kritických API endpointů
2. **Lokální vývoj** — `vercel dev` + `.env.example`, aby šlo pracovat bez produkčních tokenů
3. **Inkrementální migrace na React** — postupně, ne najednou. Začít izolovanou komponentou (např. dashboard widget).
4. **Multi-tenant příprava** — separace user-specific dat, schema pro více instalací
5. **Auth a onboarding** — registrace, nastavení vlastní instalace
6. **Distribuce** — landing page, dokumentace, demo

## Jak agenti pracují

Tento projekt používá **subagenty** — specializované role v `.claude/agents/`. Když uživatel řekne "jako Architect navrhni X", aktivuje se daný agent. Každý má svůj prompt a doménu.

**Dostupné role:**
- `pm` — **první kontakt, vždy aktivní** — tlumočí požadavky uživatele a routuje k ostatním agentům
- `security` — **aktivní při každé změně /api/ a před deployem** — bezpečnostní review, tokeny, XSS, rate limiting
- `architect` — navrhuje strukturu, rozhoduje o tech volbách (s userem)
- `frontend` — React/TS komponenty, styling, PWA features
- `backend` — Vercel Functions, API integrace, databáze
- `tester` — Vitest, Playwright, test scénáře
- `devops` — Vercel config, monitoring, CI/CD
- `product` — dokumentace, onboarding, marketing texty

Detaily každé role jsou v `.claude/agents/*.md`.
