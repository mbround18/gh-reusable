.PHONY: install lint update readme test

install:
	@echo "🔍 Installing npm dependencies..."
	@find . -name package.json \
		-not -path "*/node_modules/*" \
		-execdir sh -c 'echo "📦 Installing in $$(pwd)"; npm install' \;

update:
	@echo "🔍 Updating npm dependencies..."
	@find . -name package.json \
		-not -path "*/node_modules/*" \
		-execdir sh -c 'echo "📦 Installing in $$(pwd)"; npm update; npm upgrade; npm audit fix --force' \;

lint:
	@npx -y prettier --write .
	@cargo fmt
	@cargo clippy --all-targets --all-features -- -D warnings

test:
	@echo "🧪 Running tests in packages with test scripts..."
	@find . -name package.json \
		-not -path "*/node_modules/*" \
		-execdir sh -c 'if grep -q "\"test\":" package.json; then echo "🧪 Running tests in $$(pwd)"; npm test; fi' \;

readme:
	@cd actions/github-catalog && docker build -t actions/github-catalog .
	@docker run --rm \
		--env=INPUT_TOKEN=$(shell gh auth token) \
		--env=GITHUB_REPOSITORY=mbround18/gh-reusable \
		-v $(shell pwd):/github/workspace \
		-w /github/workspace actions/github-catalog

