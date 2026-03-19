/**
 * Visual effects manager — dim/desaturate inactive windows.
 *
 * Uses Clutter.DesaturateEffect.  The factor is set directly (not via
 * ease_property) to avoid SIGSEGV on GNOME 46 where animating effect
 * properties can crash the compositor.
 */

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

import {SignalManager} from '../util/signalManager.js';
import {getWindowActors} from '../util/compat.js';

const EFFECT_NAME = 'hypergnome-dim';

export class EffectsManager {
    /**
     * @param {Gio.Settings} settings
     */
    constructor(settings) {
        this._settings = settings;
        this._signals = new SignalManager();
    }

    enable() {
        this._signals.connect(global.display, 'notify::focus-window',
            () => this._onFocusChanged());
        this._signals.connect(this._settings, 'changed::dim-inactive',
            () => this._onDimSettingChanged());
        this._signals.connect(this._settings, 'changed::dim-strength',
            () => this._onFocusChanged());

        // Apply initial state
        this._onFocusChanged();
    }

    disable() {
        this._signals.destroy();
        this._removeAllEffects();
        this._settings = null;
    }

    _onFocusChanged() {
        if (!this._settings || !this._settings.get_boolean('dim-inactive'))
            return;

        const focusWin = global.display.get_focus_window();
        const strength = this._settings.get_double('dim-strength');

        try {
            const actors = getWindowActors();
            for (const actor of actors) {
                try {
                    const metaWin = actor.meta_window;
                    if (!metaWin || metaWin.get_window_type() !== Meta.WindowType.NORMAL)
                        continue;

                    if (metaWin === focusWin) {
                        actor.remove_effect_by_name(EFFECT_NAME);
                    } else {
                        let effect = actor.get_effect(EFFECT_NAME);
                        if (!effect) {
                            effect = new Clutter.DesaturateEffect({factor: strength});
                            actor.add_effect_with_name(EFFECT_NAME, effect);
                        } else {
                            effect.set_factor(strength);
                        }
                    }
                } catch (_e) {
                    // Individual actor failure shouldn't break the loop
                }
            }
        } catch (_e) {
            // getWindowActors may fail
        }
    }

    _onDimSettingChanged() {
        if (this._settings.get_boolean('dim-inactive')) {
            this._onFocusChanged();
        } else {
            this._removeAllEffects();
        }
    }

    _removeAllEffects() {
        try {
            const actors = getWindowActors();
            for (const actor of actors) {
                try {
                    actor.remove_effect_by_name(EFFECT_NAME);
                } catch (_e) {
                    // Effect may not exist on this actor
                }
            }
        } catch (_e) {
            // getWindowActors may fail during shutdown
        }
    }
}
