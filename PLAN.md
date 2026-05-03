# Energetika PWA — Projektový plán

> Poslední aktualizace: 2026-05-03  
> Legenda: ✅ hotovo · 🔄 in progress · ⏳ todo · ❌ zrušeno · 🤖 udělá Claude · 👤 udělá Michal

---

## 1. CO JE HOTOVÉ ✅

### Aplikace (ESS dashboard)
- ✅ Dashboard s VRM daty v reálném čase (výroba, baterie, spotřeba, síť)
- ✅ Spotové ceny OTE-CR v CZK (spot + distribuce + daně = reálná cena)
- ✅ Automatické ESS řízení přes Node-RED (setpoint, block_export, setup_SOC)
- ✅ EVCS optimalizace (nabíjení EV podle cen)
- ✅ Plán dnes + zítra (Strategie sekce)
- ✅ Statistiky & ROI
- ✅ Pravidla v Vercel Edge Config
- ✅ PWA — instalovatelné na telefon
- ✅ Midnight cache bug opraven (cache-buster ?d=YYYY-MM-DD)
- ✅ localhost:3000 fix (API_BASE přesměrování na :3002)
- ✅ Vitest testy (47 testů)

### Veřejné stránky
- ✅ `ceny.html` — CZ spotové ceny (dnes/zítra, graf, tabulka, download JSON)
- ✅ `api/ceny.js` — endpoint s buy/sell cenami, dist/tariff params
- ✅ `cenySpotEU/index.html` — EU dashboard (6 zemí, porovnání, API)
- ✅ `api/eu-prices.js` — EU proxy přes Energy-Charts (parallel fetch)
- ✅ `kalkulator.html` — kalkulačka úspory baterie
- ✅ `blog/index.html` — blog listing
- ✅ `blog/nase-fve-jak-to-cele-zacalo.html`
- ✅ `blog/spotova-cena-co-to-je.html`
- ✅ `blog/jak-nabijime-ev-chytre.html`
- ✅ `blog/baterie-jeden-rok.html`
- ✅ `blog/node-red-automatizace.html`

### SEO & technické
- ✅ `sitemap.xml` + `robots.txt`
- ✅ Open Graph + canonical meta tagy (ceny, cenySpotEU, kalkulator, blog)
- ✅ Topbar navigace na kalkulator.html
- ✅ Chart.js defer (neblokuje render)
- ✅ API URL fix v cenySpotEU (nevykazuje localhost v produkci)

---

## 2. ÚKOLY PRO CLAUDE 🤖
*Technické věci — kód, soubory, konfigurace. Stačí říct a je to hotové.*

### Tier 1 — API vylepšení (vysoký dopad, malé úsilí)

- ⏳ **Price level endpoint** — `?format=level` vrátí `{level:"low", price_eur:34.2, hour:21}`
  - Přidat do `api/eu-prices.js` i `api/ceny.js`
  - Klíčové pro Home Assistant, Node-RED, Shelly automations

- ⏳ **Rank endpoint** — `?format=rank` vrátí číslo 1–24 (1=nejlevnější hodina)
  - Perfektní pro automatizace "spusť jen pokud rank ≤ 6"

- ⏳ **Best hours endpoint** — `?format=best&count=3` vrátí 3 nejlevnější hodiny
  - `{"best_hours": [{"hour":2,"price_eur":18.4}, ...], "date":"2026-05-03"}`

- ⏳ **"Nejlepší čas" widget na ceny.html** — vizuální highlight top 3 levných hodin
  - Inspirace: spotovky.cz (plánovač spotřebičů)

### Tier 2 — API dokumentace & integrace

- ⏳ **`/api-docs.html`** — standalone stránka s dokumentací všech endpointů
  - Příklady odpovědí, parametry, curl příklady
  - SEO magnet pro vývojáře, HA komunitu, Node-RED uživatele

- ⏳ **Blog: Home Assistant integrace** — artikel s hotovým YAML kódem
  - `sensor` pro aktuální cenu, `automation` pro nejlevnější hodiny
  - Target: HA komunita = přesně naši uživatelé

- ⏳ **Blog: MQTT + Node-RED pro Cerbo GX** — jak napojit price endpoint na Cerbo MQTT
  - Rozšíření existujícího node-red-automatizace.html článku

### Tier 3 — funkce

- ⏳ **Shareable URL v kalkulačce** — `?bat=10&dist=cez&tariff=D57d`
  - URL se aktualizuje při změně parametrů, lze sdílet

- ⏳ **Historická data** — přidat `?start=YYYY-MM-DD&end=YYYY-MM-DD` do eu-prices.js
  - Energy-Charts API to podporuje, stačí předat parametry
  - Jednoduchá `/historie` stránka s výběrem měsíce

- ⏳ **CSP fix** — přidat `https://api.energy-charts.info` do `connect-src` v vercel.json
  - Preventivní oprava pro případnou browser CSP chybu

- ⏳ **`/api/health` endpoint** — `{"status":"ok","version":"1.0","timestamp":"..."}`
  - Pro UptimeRobot monitoring + debugging

- ⏳ **Rate limiting** — basic IP-based limit v eu-prices.js (max 60 req/min)
  - Ochrana před abuse bez nutnosti auth

- ⏳ **OG obrázek** — `og:image` meta tag pro sdílení na sociálních sítích
  - Statický SVG/PNG s logem a popisem

### Tier 4 — SaaS příprava (až po validaci trhu)

- ⏳ **Multi-tenant API** — vrm.js, save-config.js, data.js přepsání na per-tenant
- ⏳ **Auth middleware** — `_auth.js` helper (JWT → tenantId)
- ⏳ **Onboarding wizard** — 2 kroky: email → VRM token
- ⏳ **Demo mód** — mock data bez nutnosti VRM tokenu

---

## 3. ÚKOLY PRO MICHALA 👤
*Vyžadují ruční akci, účty, přístupy nebo rozhodnutí.*

### Deployment & infrastruktura

- ⏳ **Git commit + push** — commitnout všechny dnešní změny do test repo
  ```bash
  cd energie_vercel/energetika-vercel
  git add -A
  git commit -m "feat: veřejné stránky, blog, SEO, API vylepšení"
  git push
  ```

- ⏳ **Ověřit Vercel deploy** — zkontrolovat že mh-energy.vercel.app je aktuální
  - Jít na vercel.com → projekt → Deployments

- ⏳ **Vlastní doména** — koupit/nasměrovat doménu (např. energetika.app, fveoptimizer.cz)
  - Nutné pro AdSense + SEO + důvěryhodnost
  - Vercel Settings → Domains → Add

- ⏳ **Sloučit 2 repozitáře** — teď máš `energie_vercel` (test) a `energie_vercel_test` (prod)
  - Doporučení: jeden repo, branches main/staging
  - Claude může připravit git příkazy

### Validace trhu (nejdůležitější!)

- ⏳ **Post na Victron Community** — 1 příspěvek s otázkou + odkaz na cenySpotEU API
  - https://community.victronenergy.com
  - Text: "Free API for spot prices + Node-RED integration" 

- ⏳ **Post do FB skupiny** — "Fotovoltaika a bateriová úložiště ČR"
  - Sdílet kalkulačku + ptát se co lidi řeší

- ⏳ **10 reakcí/komentářů = pokračovat s SaaS**
  - Méně než 10 = pivotovat nebo přeformulovat

### Monetizace

- ⏳ **Google AdSense přihláška** — nutná vlastní doména + alespoň 6 článků
  - cenySpotEU má dostatečnou návštěvnost pro AdSense
  - Odhadovaný příjem: 500–2 000 Kč/měsíc začátek

- ⏳ **Brevo účet** (zdarma do 300 emailů/den) — pro email form na blogu
  - Claude připraví kód pro API call, ty vytvoříš účet + API klíč

- ⏳ **Stripe účet** — až bude SaaS ready (Tier 4)

### Node-RED & Victron

- ⏳ **Otestovat MQTT integraci** — ověřit že Cerbo GX MQTT broker přijme data
  - Claude připraví Node-RED flow JSON
  - Ty ho importuješ na Cerbo GX

- ⏳ **Otestovat čtvrthodinová data** — ověřit jestli OTE API vrací 15min od 10/2025
  - Claude upraví `_ote.js` pokud data existují

---

## 4. DEPLOYMENT NA TEST SERVER 👤

### Aktuální stav repozitářů

| | Test repo | Prod repo |
|---|---|---|
| Cesta | `energie_vercel/energetika-vercel/` | `energie_vercel_test/energie-vercel/` |
| Vercel projekt | mh-energy.vercel.app (nebo staging) | mh-energy.vercel.app |
| Branch | main | main |

### Jak nasadit dnešní změny

```bash
# 1. Přejdi do test repozitáře
cd /Users/michal/Documents/GitHub/energie_vercel/energetika-vercel

# 2. Zkontroluj co je nového
git status
git diff --stat

# 3. Commitni všechno
git add -A
git commit -m "feat: blog články, SEO meta, sitemap, kalkulačka nav, API URL fix

- Přidány 4 blog články (spotova-cena, ev-nabijeni, baterie-rok, node-red)
- sitemap.xml + robots.txt
- OG/canonical meta tagy na všech stránkách
- Topbar na kalkulator.html
- API URL fix v cenySpotEU (nevykazuje localhost v produkci)
- eu-prices.js: paralelní fetche (Promise.all)
- Chart.js: přidán defer atribut"

# 4. Push → Vercel auto-deploy
git push origin main
```

### Ověření po deployi

- [ ] https://mh-energy.vercel.app/cenySpotEU/ — načte se? API URL zobrazuje správně?
- [ ] https://mh-energy.vercel.app/kalkulator.html — má topbar?
- [ ] https://mh-energy.vercel.app/blog/spotova-cena-co-to-je.html — otevře se?
- [ ] https://mh-energy.vercel.app/sitemap.xml — zobrazí se XML?
- [ ] https://mh-energy.vercel.app/robots.txt — zobrazí se?
- [ ] https://mh-energy.vercel.app/api/eu-prices?country=cz — vrátí JSON?

---

## 5. ROADMAPA — POŘADÍ PRIORIT

```
TÝDEN 1 (teď)
├── 👤 Git commit + push + ověřit deploy
├── 🤖 Price level + rank + best hours endpoints
├── 🤖 API docs stránka
└── 👤 Post Victron Community + FB skupina

TÝDEN 2
├── 🤖 "Nejlepší čas" widget na ceny.html
├── 🤖 HA integrace blog článek
├── 🤖 Shareable URL v kalkulačce
└── 👤 Vlastní doména + AdSense přihláška

TÝDEN 3
├── 🤖 Historická data (Energy-Charts API)
├── 🤖 /api/health + rate limiting
├── 👤 Brevo email form backend
└── 👤 Vyhodnotit validaci (10+ reakcí?)

MĚSÍC 2 (pokud validace OK)
├── 🤖 Multi-tenant API (auth + KV storage)
├── 🤖 Onboarding wizard
├── 👤 Stripe setup
└── 🤖 Demo mód
```

---

## 6. KONKURENCE — PŘEHLED

| Konkurent | Silné stránky | Naše výhoda |
|---|---|---|
| spotmarketindex.cz | historická data, CZ | EU pokrytí, API, design |
| energospot.cz | 10+ let historie, PWA | API, EU, FVE kontext |
| spotovaelektrina.cz | API, čtvrthodinová data | EU, FVE ekosystém |
| smartenergyshare.com | IoT, marketplace, SaaS | Victron specifické |
| spotovky.cz | MQTT, čtvrthodinová | EU, Victron/Cerbo MQTT |

**Náš moat:** EU pokrytí (6 zemí) + veřejné API + FVE/ESS ekosystém + Victron integrace  
**Gap k doplnění:** čtvrthodinová data, historická data, MQTT pro Cerbo GX
