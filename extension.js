import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {TilingManager} from './src/core/tilingManager.js';
import {KeybindingManager} from './src/keybindings.js';

export default class HyperGnomeExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._signals = [];

        this._createIndicator();
        this._connectSettings();

        // Tiling engine
        this._tilingManager = new TilingManager(this._settings);
        this._keybindingManager = new KeybindingManager(this._settings, this._tilingManager);

        this._tilingManager.enable();
        this._keybindingManager.enable();
    }

    disable() {
        // Tear down tiling first (before disconnecting settings signals)
        if (this._keybindingManager) {
            this._keybindingManager.disable();
            this._keybindingManager = null;
        }
        if (this._tilingManager) {
            this._tilingManager.disable();
            this._tilingManager = null;
        }

        this._disconnectAll();
        this._destroyIndicator();
        this._settings = null;
    }

    // -- Indicator --

    _createIndicator() {
        this._indicator = new PanelMenu.Button(0.0, 'HyperGnome', false);

        const icon = new St.Icon({
            icon_name: 'view-grid-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(icon);

        // Header
        const header = new PopupMenu.PopupMenuItem('HyperGnome', {reactive: false});
        header.label.add_style_class_name('hypergnome-menu-header');
        this._indicator.menu.addMenuItem(header);

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Toggle tiling on/off
        const tilingToggle = new PopupMenu.PopupSwitchMenuItem(
            'Tiling',
            this._settings.get_boolean('tiling-enabled'),
        );
        this._connectSignal(tilingToggle, 'toggled', (_item, state) => {
            this._settings.set_boolean('tiling-enabled', state);
        });
        this._indicator.menu.addMenuItem(tilingToggle);
        this._tilingToggle = tilingToggle;

        // Separator
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Open preferences
        const prefsItem = new PopupMenu.PopupMenuItem('Preferences');
        this._connectSignal(prefsItem, 'activate', () => {
            this.openPreferences();
        });
        this._indicator.menu.addMenuItem(prefsItem);

        // Respect show-indicator setting
        this._indicator.visible = this._settings.get_boolean('show-indicator');

        Main.panel.addToStatusArea('hypergnome-indicator', this._indicator);
    }

    _destroyIndicator() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._tilingToggle = null;
    }

    // -- Settings --

    _connectSettings() {
        this._connectSignal(this._settings, 'changed::show-indicator', () => {
            if (this._indicator)
                this._indicator.visible = this._settings.get_boolean('show-indicator');
        });

        this._connectSignal(this._settings, 'changed::tiling-enabled', () => {
            const enabled = this._settings.get_boolean('tiling-enabled');
            if (this._tilingToggle)
                this._tilingToggle.setToggleState(enabled);
        });
    }

    // -- Signal Management --

    _connectSignal(obj, signal, handler) {
        const id = obj.connect(signal, handler);
        this._signals.push({obj, id});
        return id;
    }

    _disconnectAll() {
        for (const {obj, id} of this._signals) {
            try {
                obj.disconnect(id);
            } catch (_e) {
                // Object may already be destroyed
            }
        }
        this._signals = [];
    }
}
