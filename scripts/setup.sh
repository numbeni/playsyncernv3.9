#!/bin/bash
set -e

# Manual setup fallback for a fresh Replit import or after exporting the project.
# Delegates to the same bootstrap logic used by the Replit workflows.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

exec ./scripts/replit-bootstrap.sh
