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

const DEFAULT_DURATION_MS = 200;
const OPEN_SCALE = 0.9;

export class WindowAnimationManager {
    /**
     * @param {Gio.Settings} settings
     */
    constructor(settings) {
        this._settings = settings;
        this._signals = new SignalManager();
        this._pendingActors = new Map(); // actor -> {firstFrameId, destroyId}
    }

    enable() {
        this._signals.connect(global.display, 'window-created',
            (_d, win) => this._onWindowCreated(win));
    }

    disable() {
        this._signals.destroy();

        // Clean up any actors we're tracking
        for (const [actor, sigs] of this._pendingActors) {
            try {
                if (sigs.firstFrameId)
                    actor.disconnect(sigs.firstFrameId);
                if (sigs.destroyId)
                    actor.disconnect(sigs.destroyId);
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

        // Track signals so we can clean up if the actor is destroyed
        const sigs = {firstFrameId: null, destroyId: null};
        this._pendingActors.set(actor, sigs);

        sigs.firstFrameId = actor.connect('first-frame', () => {
            this._cleanupPending(actor);
            const dur = this._settings
                ? this._settings.get_int('animation-duration')
                : DEFAULT_DURATION_MS;
            this._animateOpen(actor, dur);
        });

        // If the actor is destroyed before first-frame, clean up
        sigs.destroyId = actor.connect('destroy', () => {
            this._pendingActors.delete(actor);
        });
    }

    _cleanupPending(actor) {
        const sigs = this._pendingActors.get(actor);
        if (!sigs)
            return;
        this._pendingActors.delete(actor);
        try {
            if (sigs.firstFrameId)
                actor.disconnect(sigs.firstFrameId);
            if (sigs.destroyId)
                actor.disconnect(sigs.destroyId);
        } catch (_e) {
            // Already disconnected
        }
    }

    _animateOpen(actor, durationMs) {
        const duration = durationMs ?? DEFAULT_DURATION_MS;
        try {
            actor.remove_all_transitions();
            actor.set_pivot_point(0.5, 0.5);
            actor.set_scale(OPEN_SCALE, OPEN_SCALE);
            actor.opacity = 0;

            actor.ease({
                scale_x: 1,
                scale_y: 1,
                opacity: 255,
                duration,
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
