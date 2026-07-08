.PHONY: backend-install frontend-install dev-backend dev-frontend train evaluate test-backend test-frontend docker-up migrate create-admin

backend-install:
	cd backend && python -m pip install -r requirements.txt

frontend-install:
	cd frontend && npm install

train:
	$(if $(DATASET),,@echo Set DATASET=path/to/verified.csv && exit 1)
	cd backend && python -m ml.train --dataset "$(DATASET)" $(if $(VERSION),--version "$(VERSION)",)

evaluate:
	$(if $(DATASET),,@echo Set DATASET=path/to/verified_holdout.csv && exit 1)
	cd backend && python -m ml.evaluate --dataset "$(DATASET)" $(if $(VERSION),--version "$(VERSION)",)

migrate:
	cd backend && alembic upgrade head

create-admin:
	$(if $(ADMIN_EMAIL),,@echo Set ADMIN_EMAIL=your-admin-email && exit 1)
	$(if $(ADMIN_PASSWORD),,@echo Set ADMIN_PASSWORD=your-strong-password && exit 1)
	cd backend && python -m scripts.create_admin --email "$(ADMIN_EMAIL)" --password "$(ADMIN_PASSWORD)"

dev-backend:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	cd frontend && npm run dev

test-backend:
	cd backend && pytest

test-frontend:
	cd frontend && npm test

docker-up:
	docker compose up --build
