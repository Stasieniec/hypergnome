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
        const now = () => global.get_current_time();

        for (let i = 1; i <= 10; i++) {
            const target = i - 1;
            this._addBinding(`tile-workspace-${i}`,
                () => WorkspaceActions.switchToWorkspace(wm, target, this._isDynamicWorkspaces(), now()));
            this._addBinding(`tile-move-to-workspace-${i}`,
                () => this._tilingManager.moveActiveToWorkspace(target, this._isDynamicWorkspaces()));
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

        // GNOME also has its own native switch-to-workspace-N / move-to-
        // workspace-N actions. If the user has those bound to the same
        // accelerator as our tile-workspace-N defaults (Super+N /
        // Super+Shift+N), whichever one grabs the accelerator first wins
        // arbitrarily - so route the native actions through our own
        // handlers to make sure ours always wins.
        const wsWm = global.workspace_manager;
        for (let i = 1; i <= 10; i++) {
            const target = i - 1;
            this._overrideBinding(`switch-to-workspace-${i}`, () => {
                WorkspaceActions.switchToWorkspace(
                    wsWm, target, this._isDynamicWorkspaces(), global.get_current_time());
            });
            this._overrideBinding(`move-to-workspace-${i}`, () => {
                this._tilingManager.moveActiveToWorkspace(target, this._isDynamicWorkspaces());
            });
        }
    }

    /**
     * @returns {boolean} whether GNOME's dynamic-workspaces mode is on
     */
    _isDynamicWorkspaces() {
        try {
            return this._mutterSettings.get_boolean('dynamic-workspaces');
        } catch (_e) {
            return true;
        }
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
            'changed::override-gnome-shortcuts',
            () => {
                try {
                    this._reloadBindings();
                } catch (e) {
                    logError(e, 'HyperGnome: failed to reload bindings on toggle change');
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
    _addBinding(name, handler) {
        Main.wm.addKeybinding(
            name,
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            () => {
                // Mark the upcoming focus change as keybind-driven so the
                // active-border pulses.  Mutter consumes the KEY_PRESS
                // event before it can be observed elsewhere, and clicks
                // bypass Clutter entirely (Wayland routes them to the
                // client), so the handler itself is the only reliable
                // place to flag "this came from a keybind".
                this._borderManager?.armKeybindPulse();
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
