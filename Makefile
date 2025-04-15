.PHONY: install lint update readme test

install:
	@echo "🔍 Installing npm dependencies..."
	@find . -name package.json \
		-not -path "*/node_modules/*" \
		-execdir sh -c 'echo "📦 Installing in $$(pwd)"; npm install' \;
	@echo "🔍 Installing pdm dependencies..."
	@find . -name pyproject.toml \
		-execdir sh -c 'echo "📦 Installing PDM in $$(pwd)"; pdm install' \;

update:
	@echo "🔍 Updating npm dependencies..."
	@find . -name package.json \
		-not -path "*/node_modules/*" \
		-execdir sh -c 'echo "📦 Installing in $$(pwd)"; npm update; npm upgrade; npm audit fix --force' \;

lint:
	@npx -y prettier --write .
	@cargo fmt
	@cargo clippy --all-targets --all-features -- -D warnings
	@echo "🔍 Running ruff format for Python projects..."
	@find . -name pyproject.toml \
		-execdir sh -c 'echo "🧹 Running ruff format in $$(pwd)"; pdm run ruff format .' \;

test: install lint
	@echo "🧪 Running tests in packages with test scripts..."
	@find . -name package.json \
		-not -path "*/node_modules/*" \
		-execdir sh -c 'if grep -q "\"test\":" package.json; then echo "🧪 Running tests in $$(pwd)"; npm test; fi' \;
	@echo "🧪 Running tests in Python packages with PDM test scripts..."
	@find . -name pyproject.toml \
		-execdir sh -c 'if grep -q "pytest" pyproject.toml; then echo "🧪 Running PDM tests in $$(pwd)"; pdm run test; fi' \;

readme:
	@cd actions/github-catalog && docker build -t actions/github-catalog .
	@docker run --rm \
		--env=INPUT_TOKEN=$(shell gh auth token) \
		--env=GITHUB_REPOSITORY=mbround18/gh-reusable \
		-v $(shell pwd):/github/workspace \
		-w /github/workspace actions/github-catalog

