# Goa Political Watch

Social-media and news intelligence for **BJP Goa** and the Government of Goa
(Chief Minister Dr. Pramod Sawant). It tracks mentions, sentiment, alerts and
grievances across X, YouTube (including live chat), Facebook, Instagram,
Telegram and the Goa press. Every score is **relative to the client**: an
attack on the Congress opposition reads as good for BJP Goa, and praise for
it reads as bad.

The codebase is a clone of AP.Blura.Saga (TDP / Andhra Pradesh). See
[ARCHITECTURE.md](ARCHITECTURE.md) for the system design and
[docs/SENTIMENT_ANALYSIS.md](docs/SENTIMENT_ANALYSIS.md) for the sentiment
pipeline. The other root-level `.md` files are analyses from earlier
deployments, kept for reference.

## Layout

| Folder | What it is |
|---|---|
| `frontend/` | React (CRA + craco) SPA. Branding lives in `src/config/partyMedia.js`, party colours in `src/config/partyColors.js`, the roster in `src/data/goaMLAs.js` / `goaMPs.js` (generated). |
| `backend/` | Node/Express API and background jobs. Deployment facts are in `src/config/deployment.js`, the political roster in `src/config/politicalData.js` → `politicalEntities.js`, and Goa datasets in `src/data/goa_*.json`. |
| `Blura-Engine/` | Python RSS engine (52 Goa, Marathi and national feeds) that writes into the same MongoDB. Config is in `political_config.py`. |

## Setup

1. **MongoDB.** Use a dedicated database called `goasaga`. Give it its own
   user, scoped to that database only (see
   [MONGODB_OPERATIONS.md](MONGODB_OPERATIONS.md)). Never point this app at
   another tenant's database.
2. **`backend/.env`.** At a minimum, set:

   | Key | Notes |
   |---|---|
   | `MONGODB_URI`, `DB_NAME="goasaga"` | |
   | `JWT_SECRET` | Long random string. If unset, a per-process random secret is used and every session ends on restart. |
   | `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD` | First superadmin. If no password is set, a random one is printed once at first start; existing users are never overwritten. |
   | `CORS_ORIGINS`, `PORT`, LLM / RapidAPI / BluGate keys | As in the existing file |

3. **`Blura-Engine/`.** The engine reads `.env.political` and falls back to
   `backend/.env`. Install it with `pip install -r requirements.txt`. Set
   `COHERE_API_KEY` to turn on LLM sentiment for articles.
4. **Seed** (from `backend/`):

   ```
   npm run seed:constituencies   # 40 ACs, 3 districts, 2 Lok Sabha seats
   npm run seed:rbac             # page permissions (+ optional senior_leader from env)
   npm run seed:accounts         # one login per MLA / MP, random passwords printed once
   npm run seed:keywords         # Goa tracking keywords, then one fetch
   ```

5. **Run.**
   - Backend: `npm run dev`, from `backend/`.
   - Frontend: `npm start`, from `frontend/`.
   - Engine: `python political_main.py`, from `Blura-Engine/`. Add `--once` for a single pass.
6. **Test.**
   - Backend: `npm run test:sentiment`, from `backend/`.
   - Frontend: `npx craco test --watchAll=false`, from `frontend/`.

## Keeping the political data current

The roster is a snapshot as of **25 Sep 2026**:

- **Assembly (40 seats):** BJP 26, INC 3, MGP 2, AAP 2, GFP 1, RGP 1, IND 3. All three Independents back the NDA.
- **Vacant seats:** Ponda (since 15 Oct 2025) and Taleigao (since 19 Jul 2026).
- **Districts:** North Goa, South Goa and Kushavati. Kushavati was created on 31 Dec 2025 from Quepem, Sanguem, Dharbandora and Canacona.

After a by-election, defection or cabinet reshuffle, update the data in this order:

1. Edit `backend/src/data/goa_mlas.json` and `goa_voter_profiles.json`.
2. If the cabinet or party leadership changed, edit the curated lists in
   `backend/src/config/politicalData.js`. Add any new spellings to
   `CURATED_ALIASES` in `politicalEntities.js`. Never add a bare surname:
   Naik, Sawant and similar names are shared across parties.
3. Regenerate the frontend roster with `node frontend/scripts/gen_goa_data.js`.
4. Only if boundaries change, rebuild the maps with
   `node frontend/scripts/build_goa_geojson.js`. This needs network access
   and runs mapshaper through npx.
5. Run `npm run test:sentiment`.

## Known limitations

- The Konkani (Devanagari and Romi) aliases and sentiment lexicons were
  written by hand. They need review by a native speaker.
- jsPDF does not shape Devanagari, so conjuncts can render incorrectly in PDF
  exports. Use the CSV export for Konkani or Marathi text.
- The RAG embedding model was validated on the earlier deployment's
  languages. Re-check its recall on Konkani and Marathi before relying on it.
- The leader portraits are Wikimedia Commons images. They need attribution
  under their licences (see `frontend/src/config/partyMedia.js`).
- The legal-notice template (`pages/GenerateReport.jsx`) ships with
  bracketed placeholders for the issuing office. Fill them in per notice.
