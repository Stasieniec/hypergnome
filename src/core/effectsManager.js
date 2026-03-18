/**
 * Visual effects manager — dim/desaturate inactive windows.
 *
 * Uses Clutter.DesaturateEffect with ease_property() on the 'factor'
 * property (a plain double, safe across all GNOME 46-49 versions).
 */

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

import {SignalManager} from '../util/signalManager.js';
import {getWindowActors} from '../util/compat.js';

const EFFECT_NAME = 'hypergnome-dim';
const DIM_DURATION_MS = 200;

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

        // Remove dim effects from ALL window actors
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
                        this._undimActor(actor);
                    } else {
                        this._dimActor(actor, strength);
                    }
                } catch (_e) {
                    // Individual actor failure shouldn't break the loop
                }
            }
        } catch (_e) {
            // getWindowActors may fail
        }
    }

    _dimActor(actor, strength) {
        let effect = actor.get_effect(EFFECT_NAME);
        if (!effect) {
            effect = new Clutter.DesaturateEffect({factor: 0.0});
            actor.add_effect_with_name(EFFECT_NAME, effect);
        }

        actor.ease_property(`@effects.${EFFECT_NAME}.factor`, strength, {
            duration: DIM_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _undimActor(actor) {
        const effect = actor.get_effect(EFFECT_NAME);
        if (!effect)
            return;

        actor.ease_property(`@effects.${EFFECT_NAME}.factor`, 0.0, {
            duration: DIM_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                try {
                    actor.remove_effect_by_name(EFFECT_NAME);
                } catch (_e) {
                    // Actor may have been destroyed
                }
            },
        });
    }

    _onDimSettingChanged() {
        if (this._settings.get_boolean('dim-inactive')) {
            this._onFocusChanged();
        } else {
            // Remove all dim effects
            try {
                const actors = getWindowActors();
                for (const actor of actors) {
                    try {
                        this._undimActor(actor);
                    } catch (_e) {
                        // Ignore
                    }
                }
            } catch (_e) {
                // Ignore
            }
        }
    }
}
