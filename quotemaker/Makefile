# Deploy the static app to the GitHub Pages checkout.
# Copies files only; committing and pushing in daspoi.github.io stays manual.

DEST ?= ../../daspoi.github.io/quotemaker

FILES = index.html app.js style.css sw.js manifest.json icons images lib

.PHONY: deploy serve

deploy:
	mkdir -p "$(DEST)"
	rsync -av --delete --exclude .DS_Store $(FILES) "$(DEST)/"

serve:
	python3 -m http.server 8080
