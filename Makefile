.PHONY: install

install:
	@echo "🔍 Installing npm dependencies..."
	@find . -name package.json \
		-not -path "*/node_modules/*" \
		-execdir sh -c 'echo "📦 Installing in $$(pwd)"; npm install' \;
