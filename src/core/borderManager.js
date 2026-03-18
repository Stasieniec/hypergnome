/**
 * Active window border overlay.
 *
 * A single St.Bin sits in global.window_group, re-tracked to the focused
 * window on every focus change.  Configurable color, width, and corner
 * radius via GSettings.  Inspired by Forge and Tiling Shell.
 */

import St from 'gi://St';

import {SignalManager} from '../util/signalManager.js';
import {animateBorder} from '../util/animator.js';

export class BorderManager {
    /**
     * @param {Gio.Settings} settings
     */
    constructor(settings) {
        this._settings = settings;
        this._signals = new SignalManager();
        this._windowSignals = new SignalManager();
        this._border = null;
        this._focusWindow = null;
        this._grabActive = false;
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    enable() {
        this._border = new St.Bin({
            style_class: 'hypergnome-active-border',
            reactive: false,
            can_focus: false,
            track_hover: false,
        });
        this._border.hide();
        global.window_group.add_child(this._border);

        this._updateStyle();

        // Track focus changes
        this._signals.connect(global.display, 'notify::focus-window',
            () => this._onFocusChanged());

        // Track grab operations — snap instantly during drag, animate otherwise
        this._signals.connect(global.display, 'grab-op-begin',
            () => { this._grabActive = true; });
        this._signals.connect(global.display, 'grab-op-end',
            () => { this._grabActive = false; });

        // Re-stack border when window z-order changes
        this._signals.connect(global.display, 'restacked',
            () => this._restack());

        // Live-update when settings change
        this._signals.connect(this._settings, 'changed::active-border-size',
            () => this._updateStyle());
        this._signals.connect(this._settings, 'changed::active-border-color',
            () => this._updateStyle());
        this._signals.connect(this._settings, 'changed::active-border-radius',
            () => this._updateStyle());

        // Show border on the currently focused window
        this._onFocusChanged();
    }

    disable() {
        this._windowSignals.destroy();
        this._signals.destroy();
        this._focusWindow = null;

        if (this._border) {
            global.window_group.remove_child(this._border);
            this._border.destroy();
            this._border = null;
        }

        this._settings = null;
    }

    // =========================================================================
    // Focus tracking
    // =========================================================================

    _onFocusChanged() {
        // Disconnect signals from the previous window
        this._windowSignals.destroy();

        const win = global.display.get_focus_window();

        // Hide border for non-tileable states
        if (!win || win.is_fullscreen() || win.minimized) {
            this._border.hide();
            this._focusWindow = null;
            return;
        }

        this._focusWindow = win;

        // Track position and size changes on the focused window
        this._windowSignals.connect(win, 'position-changed',
            () => this._updateGeometryAnimated());
        this._windowSignals.connect(win, 'size-changed',
            () => this._updateGeometryAnimated());

        // Snap instantly on focus switch (don't animate from old window's position)
        this._updateGeometry();
        this._restack();
        this._border.show();
    }

    // =========================================================================
    // Geometry & style
    // =========================================================================

    /**
     * Snap border instantly (used on focus switch).
     */
    _updateGeometry() {
        if (!this._focusWindow || !this._border)
            return;

        try {
            const rect = this._focusWindow.get_frame_rect();
            const bw = this._settings.get_int('active-border-size');

            this._border.remove_all_transitions();
            this._border.set_position(rect.x - bw, rect.y - bw);
            this._border.set_size(rect.width + bw * 2, rect.height + bw * 2);
        } catch (_e) {
            // Window may have been destroyed
        }
    }

    /**
     * Track window position/size changes — snap instantly during grab
     * (user drag), animate otherwise (tiling layout change).
     */
    _updateGeometryAnimated() {
        if (this._grabActive) {
            this._updateGeometry();
            return;
        }

        if (!this._focusWindow || !this._border)
            return;

        try {
            const rect = this._focusWindow.get_frame_rect();
            const bw = this._settings.get_int('active-border-size');
            animateBorder(this._border, rect, bw);
        } catch (_e) {
            // Window may have been destroyed
        }
    }

    _updateStyle() {
        if (!this._border)
            return;

        const color = this._settings.get_string('active-border-color');
        const width = this._settings.get_int('active-border-size');
        const radius = this._settings.get_int('active-border-radius');

        this._border.set_style(
            `border-width: ${width}px; border-color: ${color}; border-radius: ${radius}px;`,
        );
    }

    /**
     * Keep the border directly above the focused window's actor in the
     * z-order so it paints on top but below any transient dialogs.
     */
    _restack() {
        if (!this._focusWindow || !this._border)
            return;

        try {
            const actor = this._focusWindow.get_compositor_private();
            if (actor)
                global.window_group.set_child_above_sibling(this._border, actor);
        } catch (_e) {
            // Window may have been destroyed
        }
    }
}
