.PHONY: install lint

install:
	@echo "🔍 Installing npm dependencies..."
	@find . -name package.json \
		-not -path "*/node_modules/*" \
		-execdir sh -c 'echo "📦 Installing in $$(pwd)"; npm install' \;

lint:
	@npx -y prettier --write .
	@cargo fmt
	@cargo clippy --all-targets --all-features -- -D warnings