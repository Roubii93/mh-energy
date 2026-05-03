# Energetika PWA — Stav projektu & poznámky

> Tento soubor je živý dokument. Aktualizuje se po každé větší session nebo rozhodnutí.
> Poslední aktualizace: 2026-05-03

---

## Co to je

Webová PWA aplikace pro majitele FVE + ESS (Victron) + EV.
Automaticky optimalizuje ESS strategii podle spotových cen OTE-CR.

**Produkce:** https://mh-energy.vercel.app  
**Test repo:** `energie_vercel/energetika-vercel/` → localhost:3002 (vercel dev), localhost:3000 (serve .)  
**Prod repo:** `energie_vercel_test/energie-vercel/`

---

## Aktuální stav aplikace

### Co funguje ✅
- Dashboard s VRM daty v reálném čase (výroba, baterie, spotřeba, síť)
- Spotové ceny z OTE-CR v CZK (spot + distribuce + daně = reálná cena)
- Automatické ESS řízení přes Node-RED (setpoint, block_export, setup_SOC)
- EVCS optimalizace (nabíjení EV podle cen)
- Standby mód při výpadku OTE-CR (bezpečné hodnoty, žádný prodej ani nákup)
- Plán na dnes + zítra (Strategie)
- Statistiky & ROI (VRM overallstats)
- Pravidla uložená v Vercel Edge Config
- PWA — instalovatelné na telefon
- Tmavý/světlý režim
- Bottom nav pro mobil, sidebar pro desktop
- Vitest testy (47 testů, vše prochází)

### Co nefunguje / je rozbité ⚠️
- *(sem zapisovat objevené bugy)*

### Známé limity
- Single-tenant: 1 Vercel projekt = 1 uživatel
- Victron-only (Cerbo GX + Node-RED)
- Self-hosted setup: vyžaduje GitHub + Vercel + .env → bariéra pro 90 % uživatelů

---

## Technický stack

| Vrstva | Technologie |
|---|---|
| Frontend | Vanilla JS + HTML/CSS, Chart.js 4.4 |
| Backend | Vercel Serverless Functions (Node.js ESM) |
| Storage | Vercel Edge Config (rules) |
| Hosting | Vercel (GitHub push → auto-deploy) |
| ESS řízení | Node-RED na Cerbo GX |
| Data | OTE-CR API (spotové ceny), Victron VRM API |
| Testy | Vitest |

---

## Market assessment (2026-05-03)

### Závěr
**Mezera na trhu existuje.** Žádný přímý konkurent pro Victron + OTE-CR + automatická ESS optimalizace v ČR.

### Čísla
- Addressable market ČR dnes: **2 000–5 000 zákazníků** (Victron + spotový tarif)
- Regionálně (CE Evropa): 50 000–120 000 Victron ESS instalací
- Zákazník ušetří optimalizací: 15 000–40 000 Kč/rok
- Doporučená cena: **99 Kč/měs** nebo **1 990 Kč jednorázově**

### Fatální problém
Self-hosted setup je slepá ulička. **Bez managed/SaaS verze to není komerční produkt.**

### Positioning
> "Automatický obchodník s elektřinou pro váš Victron ESS"

---

## Plán — 8 kroků

| # | Krok | Stav | Priorita |
|---|---|---|---|
| 1 | **Validace trhu** — post Victron Community + FB skupiny, 20+ reakcí = pokračovat | ⏳ todo | 🔴 kritická |
| 2 | **Auth + KV storage** — Clerk auth, Vercel KV, AES-256 šifrování VRM tokenů | ⏳ todo | 🔴 kritická |
| 3 | **Migrace API na multi-tenant** — vrm.js, save-config.js, data.js přepsání na per-tenant | ⏳ todo | 🔴 kritická |
| 4 | **Onboarding wizard** — 2 kroky (email → VRM token), demo mód | ⏳ todo | 🟠 vysoká |
| 5 | **Monitoring + CI/CD** — Sentry, UptimeRobot, GitHub Actions, staging branch | ⏳ todo | 🟠 vysoká |
| 6 | **Landing page + ceník** — 5 sekcí, Stripe Checkout, beta CTA | ⏳ todo | 🟡 střední |
| 7 | **Beta launch** — 10 uživatelů, Node-RED template, 1stránková dokumentace | ⏳ todo | 🟡 střední |
| 8 | **B2B2C — instalátoři** — 3–5 Victron instalátorů, 20% provize | ⏳ todo | 🟡 střední |

Stavy: ⏳ todo · 🔄 in progress · ✅ hotovo · ❌ zrušeno

---

## Architektonická rozhodnutí

### Multi-tenant stack (navrženo, neschváleno)
- **Auth:** Clerk (magic link, free do 10k MAU)
- **Storage:** Vercel KV (Redis), schema:
  ```
  tenant:{userId}:rules       → ESS pravidla (JSON)
  tenant:{userId}:vrm_token   → AES-256 zašifrovaný VRM token
  tenant:{userId}:install_id  → Victron Installation ID
  tenant:{userId}:rate:{date} → rate limit počítadlo
  ```
- **Nové API helpery:** `_auth.js` (JWT→tenantId), `_crypto.js`, `_ratelimit.js`
- **Zachovat:** vrm.js ALLOWED_PATHS whitelist, save-config.js validace hodnot

### Git workflow (navrženo)
- `main` → production (mh-energy.vercel.app)
- `develop` → staging
- Feature branches → PR → preview URL

---

## Poznámky & rozhodnutí

### 2026-05-03
- Market assessment dokončen (Market Analyst agent)
- Multi-tenant architektura navržena (Architect, Backend, DevOps agenti)
- GTM plán navržen (Product agent)
- Vytvořen agent `market-analyst.md` v `.claude/agents/`
- Ostatní agenti (pm, security, architect, frontend, backend, tester, devops, product) — zatím jen popsáni v CLAUDE.md, soubory nevytvořeny

### Technické opravy provedené v této session
- Midnight cache bug: `fetchPrices` přidán cache-buster `?d=YYYY-MM-DD` (mění se o půlnoci CZ)
- In-memory stale check: pokud `priceData.generatedAt` je z jiného CZ dne, `hoursTomorrow` se vymaže
- localhost:3000 fix: přidán `API_BASE` v `config.js` — statický server přesměruje API volání na localhost:3002
- CORS fix pro `save-config.js` v dev módu (bez `NR_PASSWORD` → `Access-Control-Allow-Origin: *`)

---

## Backlog (nápady, nerozhodnuté)

- [ ] Sloučení dvou repozitářů do jednoho (main/staging branch)
- [ ] Node-RED webhook pro okamžité načtení pravidel (bez čekání na interval)
- [ ] Sentry monitoring
- [ ] Demo mód s mock daty
- [ ] Diagram toku energie na dashboardu (odloženo — nízká priorita)
- [ ] Lokalizace: SK, AT, DE
- [ ] Multiplatformní podpora (Fronius, Huawei) — podmínka pro větší trh

---

## Kontakty & zdroje

- OTE-CR API: `https://www.ote-cr.cz/cs/kratkodobe-trhy/elektrina/denni-trh/@@chart-data`
- Victron VRM API: `https://vrmapi.victronenergy.com/v2`
- Victron Community (GTM kanál): `https://community.victronenergy.com`
- FB skupina (GTM kanál): "Fotovoltaika a bateriová úložiště ČR"
