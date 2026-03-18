/**
 * Manages window open/close animations by hooking into Shell.WM signals.
 *
 * Shell.WM emits 'map' when a window appears and 'destroy' when it's
 * removed.  Each handler MUST eventually call completed_map / completed_destroy
 * on the WindowManager or the shell will hang waiting for the animation to finish.
 */

import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {SignalManager} from '../util/signalManager.js';
import {animateWindowOpen, animateWindowClose} from '../util/animator.js';

export class WindowAnimationManager {
    /**
     * @param {Gio.Settings} settings
     */
    constructor(settings) {
        this._settings = settings;
        this._signals = new SignalManager();
    }

    enable() {
        const wm = Main.wm;
        this._shellWm = wm._shellwm;

        this._signals.connect(this._shellWm, 'map',
            (_s, actor) => this._onMap(actor));
        this._signals.connect(this._shellWm, 'destroy',
            (_s, actor) => this._onDestroy(actor));
    }

    disable() {
        this._signals.destroy();
        this._shellWm = null;
        this._settings = null;
    }

    /**
     * @param {Meta.WindowActor} actor
     */
    _onMap(actor) {
        if (!this._settings.get_boolean('animation-enabled')) {
            this._shellWm.completed_map(actor);
            return;
        }

        // Only animate normal windows (not tooltips, popups, etc.)
        const win = actor.meta_window;
        if (!win || win.get_window_type() !== Meta.WindowType.NORMAL) {
            this._shellWm.completed_map(actor);
            return;
        }

        try {
            animateWindowOpen(actor, () => {
                try {
                    this._shellWm.completed_map(actor);
                } catch (_e) {
                    // Actor may have been destroyed during animation
                }
            });
        } catch (_e) {
            this._shellWm.completed_map(actor);
        }
    }

    /**
     * @param {Meta.WindowActor} actor
     */
    _onDestroy(actor) {
        if (!this._settings.get_boolean('animation-enabled')) {
            this._shellWm.completed_destroy(actor);
            return;
        }

        const win = actor.meta_window;
        if (!win || win.get_window_type() !== Meta.WindowType.NORMAL) {
            this._shellWm.completed_destroy(actor);
            return;
        }

        try {
            animateWindowClose(actor, () => {
                try {
                    this._shellWm.completed_destroy(actor);
                } catch (_e) {
                    // Actor may have been destroyed
                }
            });
        } catch (_e) {
            this._shellWm.completed_destroy(actor);
        }
    }
}
