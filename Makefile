.PHONY: up build down restart logs shell

## Startet die App (ohne Rebuild)
up:
	@chmod +x scripts/*.sh
	@./scripts/ensure-env.sh
	docker compose up -d

## Baut das Image neu und startet
build:
	@chmod +x scripts/*.sh
	@./scripts/ensure-env.sh
	docker compose up --build -d

## Stoppt alle Container
down:
	docker compose down

## Neustart ohne Rebuild
restart:
	docker compose restart

## Logs live anzeigen
logs:
	docker compose logs -f app

## Shell im laufenden Container öffnen
shell:
	docker compose exec app sh
