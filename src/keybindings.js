import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * Manages all HyperGnome keybindings:
 * - Custom keybindings registered via Main.wm.addKeybinding()
 * - GNOME built-in overrides via Meta.keybindings_set_custom_handler()
 */
export class KeybindingManager {
    /**
     * @param {Gio.Settings} settings
     * @param {import('./core/tilingManager.js').TilingManager} tilingManager
     */
    constructor(settings, tilingManager) {
        this._settings = settings;
        this._tilingManager = tilingManager;
        this._customBindings = [];
        this._overriddenBindings = [];
    }

    enable() {
        // -- Custom keybindings (vim-style focus) --
        this._addBinding('tile-focus-left', () => this._tilingManager.focusDirection('left'));
        this._addBinding('tile-focus-down', () => this._tilingManager.focusDirection('down'));
        this._addBinding('tile-focus-up', () => this._tilingManager.focusDirection('up'));
        this._addBinding('tile-focus-right', () => this._tilingManager.focusDirection('right'));

        // -- Custom keybindings (move window) --
        this._addBinding('tile-move-left', () => this._tilingManager.moveDirection('left'));
        this._addBinding('tile-move-down', () => this._tilingManager.moveDirection('down'));
        this._addBinding('tile-move-up', () => this._tilingManager.moveDirection('up'));
        this._addBinding('tile-move-right', () => this._tilingManager.moveDirection('right'));

        // -- Custom keybindings (actions) --
        this._addBinding('tile-toggle-float', () => this._tilingManager.toggleFloat());
        this._addBinding('tile-close-window', () => this._tilingManager.closeWindow());
        this._addBinding('tile-toggle-split', () => this._tilingManager.toggleSplit());
        this._addBinding('tile-equalize', () => this._tilingManager.equalize());

        // -- Custom keybindings (resize window) --
        this._addBinding('tile-resize-left', () => this._tilingManager.resizeDirection('left'));
        this._addBinding('tile-resize-down', () => this._tilingManager.resizeDirection('down'));
        this._addBinding('tile-resize-up', () => this._tilingManager.resizeDirection('up'));
        this._addBinding('tile-resize-right', () => this._tilingManager.resizeDirection('right'));

        // -- Override conflicting GNOME keybindings --

        // Super+H is GNOME minimize — conflicts with our focus-left
        this._overrideBinding('minimize', () => {
            // Swallowed — our tile-focus-left handles Super+H
        });

        // Super+Left/Right is GNOME half-tile — we handle tiling
        this._overrideBinding('toggle-tiled-left', () => {
            this._tilingManager.focusDirection('left');
        });

        this._overrideBinding('toggle-tiled-right', () => {
            this._tilingManager.focusDirection('right');
        });

        // Super+Down is GNOME unmaximize — conflicts with our focus-down
        this._overrideBinding('unmaximize', () => {
            this._tilingManager.focusDirection('down');
        });
    }

    disable() {
        for (const name of this._customBindings) {
            try {
                Main.wm.removeKeybinding(name);
            } catch (_e) {
                // Already removed
            }
        }
        this._customBindings = [];

        for (const name of this._overriddenBindings) {
            try {
                Meta.keybindings_set_custom_handler(name, null);
            } catch (_e) {
                // Already restored
            }
        }
        this._overriddenBindings = [];

        this._settings = null;
        this._tilingManager = null;
    }

    /**
     * Register a custom keybinding from our GSettings schema.
     * @param {string} name - GSettings key name
     * @param {Function} handler
     */
    _addBinding(name, handler) {
        Main.wm.addKeybinding(
            name,
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            () => {
                try {
                    handler();
                } catch (e) {
                    logError(e, `HyperGnome keybinding: ${name}`);
                }
            },
        );
        this._customBindings.push(name);
    }

    /**
     * Override a built-in GNOME keybinding.
     * @param {string} name - Built-in keybinding name
     * @param {Function} handler
     */
    _overrideBinding(name, handler) {
        Meta.keybindings_set_custom_handler(name, () => {
            try {
                handler();
            } catch (e) {
                logError(e, `HyperGnome override: ${name}`);
            }
        });
        this._overriddenBindings.push(name);
    }
}
