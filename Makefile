UUID = hypergnome@hypergnome.dev
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SRC_DIR = $(CURDIR)

.PHONY: install uninstall schemas dist clean enable disable logs

install: schemas
	@mkdir -p $(dir $(INSTALL_DIR))
	@if [ -L "$(INSTALL_DIR)" ]; then \
		echo "Symlink already exists, updating..."; \
		rm "$(INSTALL_DIR)"; \
	elif [ -d "$(INSTALL_DIR)" ]; then \
		echo "Error: $(INSTALL_DIR) is a real directory, not a symlink. Remove it first."; \
		exit 1; \
	fi
	ln -s "$(SRC_DIR)" "$(INSTALL_DIR)"
	@echo "Installed (symlinked) to $(INSTALL_DIR)"
	@echo "Restart GNOME Shell, then: make enable"

uninstall:
	rm -f "$(INSTALL_DIR)"
	@echo "Removed symlink $(INSTALL_DIR)"

schemas:
	glib-compile-schemas schemas/

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

logs:
	journalctl -f -o cat /usr/bin/gnome-shell

dist:
	@mkdir -p dist
	@rm -f dist/$(UUID).zip
	zip -r dist/$(UUID).zip \
		metadata.json \
		extension.js \
		prefs.js \
		stylesheet.css \
		schemas/*.xml \
		src/ \
		LICENSE
	@echo "Built dist/$(UUID).zip"

clean:
	rm -rf dist/
	rm -f schemas/gschemas.compiled
