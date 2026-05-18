#!/bin/bash

for file in tests/*.test.js index.test.js; do
  if [ ! -f "$file" ]; then
    continue
  fi
  
  # Add vitest import at the very top if not present
  if ! head -1 "$file" | grep -q "from .vitest"; then
    echo 'import { describe, test, beforeEach, afterEach, vi, expect } from "vitest";' | cat - "$file" > temp && mv temp "$file"
  fi
  
  # Replace jest. with vi.
  sed -i 's/jest\.mock/vi.mock/g' "$file"
  sed -i 's/jest\.fn/vi.fn/g' "$file"
  sed -i 's/jest\.clearAllMocks/vi.clearAllMocks/g' "$file"
  sed -i 's/jest\.resetAllMocks/vi.clearAllMocks/g' "$file"
  sed -i 's/jest\.resetModules/vi.resetModules/g' "$file"
  
done
