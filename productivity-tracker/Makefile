# `make` copies the app into the GitHub Pages checkout, then you commit and push there.
# This project lives at ~/git/antigravity/productivity-tracker; the Pages checkout at ~/git/daspoi.github.io.
# Override the target with: make DEPLOY=/some/other/path

DEPLOY ?= ../../daspoi.github.io/productivity

# Everything in this folder is the app except these.
EXCLUDES := --exclude .git --exclude .gitignore --exclude .DS_Store --exclude Makefile \
            --exclude '*.md' --exclude tasks --exclude tests --exclude old.backup.pyserver

.PHONY: deploy check test serve

deploy: check test
	mkdir -p $(DEPLOY)
	rsync -a --delete $(EXCLUDES) ./ $(DEPLOY)/
	touch $(DEPLOY)/../.nojekyll
	@echo "Copied to $(DEPLOY)."
	@echo "Next: cd $(DEPLOY)/.. && git add -A && git commit -m 'productivity: update' && git push"

check:
	node --check app.js
	node --check store.js
	node --check sw.js

test:
	node --test tests/store.test.mjs

serve:
	python3 -m http.server 8000
