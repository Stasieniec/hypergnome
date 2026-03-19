/**
 * Manages window open animations.
 *
 * Hooks into 'window-created' on the display and animates the window actor
 * once it becomes visible (via 'first-frame' signal on the actor).
 *
 * Close animations are NOT supported because the only safe way is to
 * override Shell.WM._destroyWindow, which would be monkey-patching.
 */

import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';

import {SignalManager} from '../util/signalManager.js';

const OPEN_DURATION_MS = 200;
const OPEN_SCALE = 0.9;

export class WindowAnimationManager {
    /**
     * @param {Gio.Settings} settings
     */
    constructor(settings) {
        this._settings = settings;
        this._signals = new SignalManager();
        this._pendingActors = new Set();
    }

    enable() {
        this._signals.connect(global.display, 'window-created',
            (_d, win) => this._onWindowCreated(win));
    }

    disable() {
        this._signals.destroy();

        // Clean up any actors we're tracking
        for (const actor of this._pendingActors) {
            try {
                actor.opacity = 255;
                actor.set_scale(1, 1);
                actor.set_pivot_point(0, 0);
            } catch (_e) {
                // Actor may have been destroyed
            }
        }
        this._pendingActors.clear();

        this._settings = null;
    }

    _onWindowCreated(win) {
        if (!this._settings || !this._settings.get_boolean('animation-enabled'))
            return;

        if (!win || win.get_window_type() !== Meta.WindowType.NORMAL)
            return;

        const actor = win.get_compositor_private();
        if (!actor)
            return;

        // Wait for the actor's first frame to be drawn before animating
        this._pendingActors.add(actor);
        const sigId = actor.connect('first-frame', () => {
            try {
                actor.disconnect(sigId);
            } catch (_e) {
                // Already disconnected
            }
            this._pendingActors.delete(actor);
            this._animateOpen(actor);
        });
    }

    _animateOpen(actor) {
        try {
            actor.remove_all_transitions();
            actor.set_pivot_point(0.5, 0.5);
            actor.set_scale(OPEN_SCALE, OPEN_SCALE);
            actor.opacity = 0;

            actor.ease({
                scale_x: 1,
                scale_y: 1,
                opacity: 255,
                duration: OPEN_DURATION_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: () => {
                    try {
                        actor.set_scale(1, 1);
                        actor.opacity = 255;
                        actor.set_pivot_point(0, 0);
                    } catch (_e) {
                        // Actor may have been destroyed
                    }
                },
            });
        } catch (_e) {
            // If animation fails, ensure actor is visible
            try {
                actor.opacity = 255;
                actor.set_scale(1, 1);
                actor.set_pivot_point(0, 0);
            } catch (_e2) {
                // Actor may have been destroyed
            }
        }
    }
}
