import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as WorkspaceActions from './workspaceActions.js';

/**
 * Manages all HyperGnome keybindings:
 * - Custom keybindings registered via Main.wm.addKeybinding()
 * - GNOME built-in overrides via Meta.keybindings_set_custom_handler()
 */
export class KeybindingManager {
    /**
     * @param {Gio.Settings} settings
     * @param {import('./core/tilingManager.js').TilingManager} tilingManager
     * @param {object} [borderManager] - optional, used to arm the focus
     *   pulse before keybind handlers run (so click and other non-keybind
     *   focus changes don't pulse).
     */
    constructor(settings, tilingManager, borderManager = null) {
        this._settings = settings;
        this._tilingManager = tilingManager;
        this._borderManager = borderManager;
        this._customBindings = [];
        this._overriddenBindings = [];
        this._settingsChangedId = 0;
        this._overrideEnabled = false;
        this._mutterSettings = new Gio.Settings({schema_id: 'org.gnome.mutter'});
        this._shellKeybindingsSettings = new Gio.Settings({schema_id: 'org.gnome.shell.keybindings'});
    }

    enable() {
        this._overrideEnabled = this._settings.get_boolean('override-gnome-shortcuts');

        this._registerCustomBindings();
        if (this._overrideEnabled) {
            this._installGnomeOverrides();
        }
        this._connectToggleListener();
    }

    disable() {
        if (this._settingsChangedId && this._settings) {
            try {
                this._settings.disconnect(this._settingsChangedId);
            } catch (_e) {}
            this._settingsChangedId = 0;
        }

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

        this._restoreAppAccelerators();

        this._settings = null;
        this._tilingManager = null;
        this._borderManager = null;
        this._mutterSettings = null;
        this._shellKeybindingsSettings = null;
    }

    _registerCustomBindings() {
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
        this._addBinding(
            'tile-toggle-tiling',
            () => this._tilingManager.toggleTilingEnabled(),
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            false,
        );
        this._addBinding('tile-toggle-float', () => this._tilingManager.toggleFloat());
        this._addBinding('tile-close-window', () => this._tilingManager.closeWindow());
        this._addBinding('tile-toggle-split', () => this._tilingManager.toggleSplit());
        this._addBinding('tile-equalize', () => this._tilingManager.equalize());

        // -- Custom keybindings (master layout) --
        this._addBinding('tile-swap-master',
            () => this._tilingManager.swapWithMaster());
        this._addBinding('tile-focus-master',
            () => this._tilingManager.focusMaster());
        this._addBinding('tile-cycle-orientation',
            () => this._tilingManager.cycleOrientation());

        // -- Custom keybindings (resize window) --
        this._addBinding('tile-resize-left', () => this._tilingManager.resizeDirection('left'));
        this._addBinding('tile-resize-down', () => this._tilingManager.resizeDirection('down'));
        this._addBinding('tile-resize-up', () => this._tilingManager.resizeDirection('up'));
        this._addBinding('tile-resize-right', () => this._tilingManager.resizeDirection('right'));

        // -- Custom keybindings (workspaces, Hyprland-style) --
        const wm = global.workspace_manager;
        const mutterSettings = this._mutterSettings;
        const isDynamic = () => {
            try {
                return mutterSettings.get_boolean('dynamic-workspaces');
            } catch (_e) {
                return true;
            }
        };
        const now = () => global.get_current_time();

        for (let i = 1; i <= 10; i++) {
            const target = i - 1;
            this._addBinding(`tile-workspace-${i}`,
                () => WorkspaceActions.switchToWorkspace(wm, target, isDynamic(), now()));
            this._addBinding(`tile-move-to-workspace-${i}`,
                () => this._tilingManager.moveActiveToWorkspace(target, isDynamic()));
        }
        this._addBinding('tile-workspace-prev',
            () => WorkspaceActions.cycleWorkspace(wm, -1, now()));
        this._addBinding('tile-workspace-next',
            () => WorkspaceActions.cycleWorkspace(wm, +1, now()));
        this._addBinding('tile-move-workspace-prev',
            () => this._tilingManager.moveActiveAndCycle(-1));
        this._addBinding('tile-move-workspace-next',
            () => this._tilingManager.moveActiveAndCycle(+1));
    }

    _installGnomeOverrides() {
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

        // Super+Shift+Arrow is GNOME move-to-monitor — conflicts with our
        // tile-move-* bindings.  Route through moveDirection() which checks
        // for same-monitor neighbors first, then falls back to cross-monitor.
        this._overrideBinding('move-to-monitor-left', () => {
            this._tilingManager.moveDirection('left');
        });
        this._overrideBinding('move-to-monitor-right', () => {
            this._tilingManager.moveDirection('right');
        });
        this._overrideBinding('move-to-monitor-up', () => {
            this._tilingManager.moveDirection('up');
        });
        this._overrideBinding('move-to-monitor-down', () => {
            this._tilingManager.moveDirection('down');
        });

        // Super+1..9 is GNOME's switch-to-application-N — conflicts with our
        // tile-workspace-N bindings. Setting a no-op handler does not free the
        // accelerator (Mutter still grabs Super+N for it), so we clear the
        // accelerator and stash the original for restoration on disable.
        this._clearAppAccelerators();
    }

    /**
     * Clear GNOME's switch-to-application-1..9 accelerators so Super+1..9
     * reaches our tile-workspace-N bindings. Saves originals to our own
     * GSettings stash for crash-safe restoration.
     */
    _clearAppAccelerators() {
        for (let i = 1; i <= 9; i++) {
            try {
                const stashKey = `stashed-switch-to-application-${i}`;
                const systemKey = `switch-to-application-${i}`;
                const stashed = this._settings.get_strv(stashKey);
                if (stashed.length === 0) {
                    // First time clearing — save the user's current value.
                    const current = this._shellKeybindingsSettings.get_strv(systemKey);
                    if (current.length > 0)
                        this._settings.set_strv(stashKey, current);
                }
                this._shellKeybindingsSettings.set_strv(systemKey, []);
            } catch (e) {
                logError(e, `HyperGnome: failed to clear switch-to-application-${i}`);
            }
        }
    }

    /**
     * Restore GNOME's switch-to-application-1..9 accelerators from our stash.
     * Safe to call repeatedly: empty stash entries are skipped.
     */
    _restoreAppAccelerators() {
        if (!this._settings || !this._shellKeybindingsSettings)
            return;
        for (let i = 1; i <= 9; i++) {
            try {
                const stashKey = `stashed-switch-to-application-${i}`;
                const systemKey = `switch-to-application-${i}`;
                const stashed = this._settings.get_strv(stashKey);
                if (stashed.length > 0) {
                    this._shellKeybindingsSettings.set_strv(systemKey, stashed);
                    this._settings.set_strv(stashKey, []);
                }
            } catch (e) {
                logError(e, `HyperGnome: failed to restore switch-to-application-${i}`);
            }
        }
    }

    _connectToggleListener() {
        this._settingsChangedId = this._settings.connect(
            'changed',
            (_settings, key) => {
                if (key !== 'override-gnome-shortcuts' && !key.startsWith('tile-'))
                    return;
                try {
                    this._reloadBindings();
                } catch (e) {
                    logError(e, 'HyperGnome: failed to reload bindings on settings change');
                }
            });
    }

    _reloadBindings() {
        // Tear down all keybindings except the settings listener, then rebuild.
        for (const name of this._customBindings) {
            try { Main.wm.removeKeybinding(name); } catch (_e) { /* Already removed */ }
        }
        this._customBindings = [];

        for (const name of this._overriddenBindings) {
            try { Meta.keybindings_set_custom_handler(name, null); } catch (_e) { /* Already restored */ }
        }
        this._overriddenBindings = [];

        // Restore the user's switch-to-application accelerators. If the new
        // state is "override on", _installGnomeOverrides will re-stash and
        // re-clear them. If "off", they stay restored.
        this._restoreAppAccelerators();

        this._overrideEnabled = this._settings.get_boolean('override-gnome-shortcuts');
        this._registerCustomBindings();
        if (this._overrideEnabled) {
            this._installGnomeOverrides();
        }
    }

    /**
     * Register a custom keybinding from our GSettings schema.
     * @param {string} name - GSettings key name
     * @param {Function} handler
     */
    _addBinding(name, handler, flags = Meta.KeyBindingFlags.NONE, armPulse = true) {
        const action = Main.wm.addKeybinding(
            name,
            this._settings,
            flags,
            Shell.ActionMode.NORMAL,
            () => {
                if (armPulse)
                    this._borderManager?.armKeybindPulse();
                try {
                    handler();
                } catch (e) {
                    logError(e, `HyperGnome keybinding: ${name}`);
                }
            },
        );
        if (action === Meta.KeyBindingAction.NONE) {
            let accels = [];
            try {
                accels = this._settings.get_strv(name);
            } catch (e) {
                logError(e,
                    `HyperGnome: "${name}" is missing from the loaded schema — restart GNOME Shell after updating the extension, then run: make schemas`);
            }
            logError(
                new Error(
                    `add_keybinding failed for "${name}"` +
                    ` (accelerators: ${accels.length ? accels.join(', ') : 'none'})`),
                'HyperGnome keybinding registration');
        }
        this._customBindings.push(name);
    }

    /**
     * Override a built-in GNOME keybinding.
     * @param {string} name - Built-in keybinding name
     * @param {Function} handler
     */
    _overrideBinding(name, handler) {
        Meta.keybindings_set_custom_handler(name, () => {
            this._borderManager?.armKeybindPulse();
            try {
                handler();
            } catch (e) {
                logError(e, `HyperGnome override: ${name}`);
            }
        });
        this._overriddenBindings.push(name);
    }
}
