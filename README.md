# PhishGuard

Intelligent Email Phishing Analyzer. PhishGuard is a full-stack cybersecurity dashboard for analyzing pasted emails, URL lists, raw headers, and common uploaded file types, including email files, documents, spreadsheets, slides, text/code, web files, images, archives, media files, and executable metadata.

Tagline: **Think Before You Click**

## What Makes This Production-Oriented

- No fake users or fake activity. The first administrator can be seeded explicitly from `.env` for deployment readiness.
- No fake dashboard statistics.
- No hidden synthetic model training during startup.
- No preloaded analysis route or prefilled phishing sample.
- Machine learning is explicit: the repository includes a visible starter NLP baseline, and larger deployments can import a verified dataset, train a versioned model, evaluate it, then activate it.
- If no model is active, the analyzer still runs deterministic security rules and clearly marks the ML component unavailable instead of pretending.

## Stack

- Frontend: Next.js, TypeScript, Tailwind CSS, local shadcn-style primitives, Lucide icons, Framer Motion, Recharts, Axios.
- Backend: FastAPI, Pydantic, SQLAlchemy, Alembic, PostgreSQL-ready persistence, JWT auth, Argon2 password hashing, BeautifulSoup, tldextract, scikit-learn, pandas, NumPy, joblib, reportlab.
- ML: word TF-IDF, character TF-IDF, engineered cybersecurity features, logistic regression probabilities, versioned joblib artifacts.
- Deployment: Docker Compose with PostgreSQL, backend, frontend, health checks, and persistent model artifacts.

## Quick Start: Local

```bash
cd backend
py -3 -m pip install -r requirements.txt
py -3 -m alembic upgrade head
py -3 -m scripts.create_admin --email <admin-email> --password "<strong-password>"
py -3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```bash
cd frontend
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

- Frontend: http://127.0.0.1:3000
- Backend: http://127.0.0.1:8000
- OpenAPI docs: http://127.0.0.1:8000/docs

Create normal user accounts through the registration page. Create administrators with `scripts.create_admin`, or set `AUTO_SEED_ADMIN=true`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_FULL_NAME` in `.env` before starting the backend.

The sample `.env.example` uses:

- Email: `admin@phishguard.com`
- Password: `AdminAccess!234`

Change these values before a real deployment.

## Docker

```bash
docker compose up --build
```

The compose stack runs PostgreSQL, the FastAPI backend, and the Next.js frontend. The backend uses the included `starter-nlp-v1` artifact by default. For production or formal evaluation, train and activate a larger verified model from approved data.

## Verified Dataset Format

Training CSV files must use this normalized schema:

```text
id
subject
body
sender
reply_to
headers
urls
label
source
created_at
verified
```

Supported labels for the first classifier are:

- `safe`
- `phishing`

Only verified, legally usable data should be used. Do not import leaked credentials, real secrets, or unapproved private emails.

## ML Commands

```bash
# Inspect the included starter NLP model
cd backend && py -3 -m ml.evaluate --dataset ml\data\starter_nlp_verified.csv --version starter-nlp-v1

# Validate and normalize a verified dataset
cd backend && py -3 -m ml.import_dataset --input C:\path\to\verified.csv --output ml\data\verified.csv

# Train a candidate or active model from that verified dataset
cd backend && py -3 -m ml.train --dataset ml\data\verified.csv --version v1.0.0

# Evaluate a model against a holdout dataset
cd backend && py -3 -m ml.evaluate --dataset ml\data\verified_holdout.csv --version v1.0.0

# Activate a reviewed model artifact
cd backend && py -3 -m ml.activate_model --version v1.0.0
```

Admin-initiated retraining uses only approved feedback samples and refuses to run until there are at least 50 approved samples for the requested dataset version.

## Common Commands

```bash
# Database migration
cd backend && py -3 -m alembic upgrade head

# Default administrator
cd backend && py -3 -m scripts.create_admin --email <admin-email> --password "<strong-password>"

# Or seed from .env on backend startup
AUTO_SEED_ADMIN=true
ADMIN_EMAIL=admin@phishguard.com
ADMIN_PASSWORD=AdminAccess!234

# Tests
cd backend && py -3 -m pytest -q
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
cd frontend && npx playwright test
```

## Risk Score

The final score is normalized from 0 to 100:

- Machine-learning model: 45%
- URL risk: 20%
- Sender/domain risk: 15%
- Authentication findings: 10%
- Attachment metadata risk: 5%
- Language risk: 5%

If no ML model is active, the remaining deterministic components are reweighted transparently and the report includes a model-unavailable indicator.

Categories:

- 0-19: Safe
- 20-39: Low Risk
- 40-59: Suspicious
- 60-79: Phishing
- 80-100: Critical Threat

Severe-evidence overrides are transparent in the report, for example credential-request language combined with deceptive links, executable attachment metadata combined with impersonation, or authentication failures combined with impersonation and credential requests.

## Feedback and Retraining

User feedback is never used automatically. The workflow is:

1. User submits correct / false positive / false negative / unsure feedback.
2. Feedback remains pending.
3. Admin approves or rejects it.
4. Approved feedback creates a verified training sample.
5. Admin starts candidate retraining.
6. Candidate metrics are checked against precision and recall thresholds.
7. Admin activates the candidate or rolls back to a previous model.

## Security Notes

- Attachments are never executed.
- Uploaded file handling is extension allowlisted. Text-like files are parsed for URLs and content signals; binary, archive, media, and executable formats are analyzed as attachment metadata only.
- URLs can be checked with a guarded server-side live probe. The probe follows a small redirect chain, blocks private/internal destinations, validates TLS, and does not execute browser JavaScript.
- Remote email images are blocked in previews.
- HTML is sanitized with dangerous tags and event handlers removed.
- Passwords use Argon2 hashes.
- JWT access and refresh tokens are used for API auth.
- Admin routes require role-based authorization.
- SQLAlchemy parameterization protects database access.
- Rate limits protect login and analysis endpoints.
- Optional reputation APIs are disabled unless keys are supplied.

## Privacy Notes

- Users can delete individual analyses, delete all history, export personal data, or delete their account.
- Uploaded files are parsed; the app does not need to store raw uploaded files.
- Supported uploads include `.eml`, `.msg`, `.txt`, `.md`, `.csv`, `.json`, `.xml`, `.html`, `.svg`, `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, OpenDocument files, common images, archives, media files, and executable/script metadata.
- Stored analysis JSON avoids raw passwords/tokens and focuses on structured evidence.
- Logs should not contain full sensitive email bodies.

## Limitations

- `.msg` and legacy Office binary parsing use safe best-effort text extraction; full-fidelity parsing should be added with hardened parsers before relying on them for investigations.
- Images, media, archives, and executables are accepted for metadata and attachment-risk analysis only; OCR, antivirus scanning, archive unpacking, and malware detonation are intentionally out of scope unless dedicated hardened services are configured.
- External URL reputation and malware scanning are optional and disabled without API keys.
- A trained ML model is only as good as the verified dataset used to train it.
- NPM audit may report moderate advisories from Next's bundled dependencies depending on the installed Next release. Do not downgrade framework versions to satisfy an unsafe audit suggestion without review.

## Verification Performed

- Backend tests: passing.
- Frontend unit tests: passing.
- Frontend lint: passing.
- Frontend production build: passing.
- ML/NLP train and inference tests: passing.
- API smoke: passing. The app registers a user, uses the active starter NLP model, and still combines model evidence with deterministic URL, sender, header, attachment, and language analysis.

## Project Structure

```text
phishguard/
  backend/
    app/
      api/
      analyzers/
      core/
      database/
      models/
      schemas/
      security/
      services/
      main.py
    ml/
      data/
      features/
      train.py
      evaluate.py
      import_dataset.py
      inference.py
      registry.py
    migrations/
    scripts/
    tests/
  frontend/
    app/
    components/
    lib/
    services/
    tests/
  docs/
  docker-compose.yml
  .env.example
  Makefile
```

## Future Improvements

- Add hardened full-fidelity `.msg` and legacy Office parsing with corpus tests.
- Add optional OCR and sandbox integrations for image, archive, and executable investigations.
- Add Redis-backed rate limiting for multi-replica deployments.
- Add optional VirusTotal / Safe Browsing reputation adapters.
- Add DKIM/SPF/DMARC DNS verification for original domains when safe and configured.
- Add richer Playwright coverage for logged-in analyzer, admin review, and report download flows.
- Add encrypted object storage for report retention in production.
