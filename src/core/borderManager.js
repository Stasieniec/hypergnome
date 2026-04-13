/**
 * Active window border overlay.
 *
 * Two modes:
 * - Solid mode (default): St.Bin with CSS border — zero overhead.
 * - Gradient mode: St.DrawingArea with Cairo gradient painting.
 *   Activated when active-border-color-secondary is non-empty
 *   and differs from the primary color.
 *
 * Features:
 * - Focus pulse: brief scale-up on focus change
 * - Gradient rotation: animated angle via Clutter.Timeline
 */

import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {SignalManager} from '../util/signalManager.js';
import {animateBorder} from '../util/animator.js';
import {parseColor} from '../util/colorParser.js';

const PULSE_SCALE = 1.04;
const PULSE_DURATION_MS = 150;
const PULSE_SETTLE_MS = 200;

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

        // Gradient mode state
        this._isGradient = false;
        this._timeline = null;
        this._gradientAngle = 0;
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    enable() {
        this._rebuildBorder();

        // Track focus changes
        this._signals.connect(global.display, 'notify::focus-window',
            () => this._onFocusChanged());

        // Track grab operations — snap instantly during drag
        this._signals.connect(global.display, 'grab-op-begin',
            () => { this._grabActive = true; });
        this._signals.connect(global.display, 'grab-op-end',
            () => { this._grabActive = false; });

        // Re-stack when z-order changes
        this._signals.connect(global.display, 'restacked',
            () => this._restack());

        // Live-update on settings change
        this._signals.connect(this._settings, 'changed::active-border-size',
            () => this._onStyleSettingsChanged());
        this._signals.connect(this._settings, 'changed::active-border-color',
            () => this._onStyleSettingsChanged());
        this._signals.connect(this._settings, 'changed::active-border-radius',
            () => this._onStyleSettingsChanged());
        this._signals.connect(this._settings, 'changed::active-border-color-secondary',
            () => this._onGradientSettingsChanged());
        this._signals.connect(this._settings, 'changed::active-border-gradient-angle',
            () => this._onGradientSettingsChanged());
        this._signals.connect(this._settings, 'changed::active-border-gradient-speed',
            () => this._onGradientSpeedChanged());
        // focus-pulse is read at use-time in _onFocusChanged, so it picks up
        // the new value on the next focus event with no subscription needed.

        // Show border on the currently focused window
        this._onFocusChanged();
    }

    disable() {
        this._stopTimeline();
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
    // Border creation
    // =========================================================================

    _rebuildBorder() {
        const hadFocus = this._focusWindow;

        // Destroy old border
        if (this._border) {
            global.window_group.remove_child(this._border);
            this._border.destroy();
            this._border = null;
        }
        this._stopTimeline();

        const secondary = this._settings.get_string('active-border-color-secondary');
        const primary = this._settings.get_string('active-border-color');
        this._isGradient = secondary !== '' && secondary !== primary;

        if (this._isGradient) {
            this._createGradientBorder();
        } else {
            this._createSolidBorder();
        }

        this._border.hide();
        global.window_group.add_child(this._border);

        if (this._isGradient)
            this._startTimeline();

        // Restore tracking if we had focus
        if (hadFocus) {
            this._updateGeometry();
            this._restack();
            this._border.show();
        }
    }

    _createSolidBorder() {
        this._border = new St.Bin({
            style_class: 'hypergnome-active-border',
            reactive: false,
            can_focus: false,
            track_hover: false,
        });
        this._updateSolidStyle();
    }

    _createGradientBorder() {
        this._border = new St.DrawingArea({
            reactive: false,
        });
        this._border.set_pivot_point(0.5, 0.5);

        this._border.connect('repaint', (area) => {
            try {
                const cr = area.get_context();
                const [width, height] = area.get_surface_size();
                this._paintGradient(cr, width, height);
                cr.$dispose();
            } catch (_e) {
                // Cairo errors shouldn't crash the shell
            }
        });

        this._gradientAngle = this._settings.get_int('active-border-gradient-angle');
    }

    // =========================================================================
    // Gradient painting (Cairo)
    // =========================================================================

    _paintGradient(cr, width, height) {
        if (width <= 0 || height <= 0)
            return;

        // Clear the canvas
        cr.setOperator(Cairo.Operator.CLEAR);
        cr.paint();
        cr.setOperator(Cairo.Operator.OVER);

        const bw = this._settings.get_int('active-border-size');
        const radius = this._settings.get_int('active-border-radius');
        const primary = parseColor(this._settings.get_string('active-border-color'));
        const secondary = parseColor(this._settings.get_string('active-border-color-secondary'));

        // Compute gradient endpoints from angle
        const angle = this._gradientAngle * Math.PI / 180;
        const cx = width / 2;
        const cy = height / 2;
        const len = Math.max(width, height);
        const dx = Math.cos(angle) * len / 2;
        const dy = Math.sin(angle) * len / 2;

        // Create linear gradient
        const pat = new Cairo.LinearGradient(
            cx - dx, cy - dy, cx + dx, cy + dy,
        );
        pat.addColorStopRGBA(0, primary.r, primary.g, primary.b, primary.a);
        pat.addColorStopRGBA(1, secondary.r, secondary.g, secondary.b, secondary.a);

        // Draw rounded rectangle border (stroke only)
        cr.setLineWidth(bw);
        const half = bw / 2;
        this._roundedRectPath(cr, half, half, width - bw, height - bw, Math.max(0, radius - half));
        cr.setSource(pat);
        cr.stroke();
    }

    _roundedRectPath(cr, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        cr.newPath();
        cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
        cr.lineTo(x + w - r, y);
        cr.arc(x + w - r, y + r, r, 1.5 * Math.PI, 2 * Math.PI);
        cr.lineTo(x + w, y + h - r);
        cr.arc(x + w - r, y + h - r, r, 0, 0.5 * Math.PI);
        cr.lineTo(x + r, y + h);
        cr.arc(x + r, y + h - r, r, 0.5 * Math.PI, Math.PI);
        cr.closePath();
    }

    _invalidateCanvas() {
        if (!this._border || !this._isGradient)
            return;
        this._border.queue_repaint();
    }

    // =========================================================================
    // Gradient rotation (Clutter.Timeline)
    // =========================================================================

    _startTimeline() {
        if (this._timeline)
            return;

        const speed = this._settings.get_double('active-border-gradient-speed');
        if (speed <= 0)
            return;

        // Treat `speed` as "degrees per frame at 60fps" to preserve the
        // setting's existing meaning, but advance by real elapsed time so
        // the rotation rate stays consistent across frame drops, throttled
        // compositors, and resume-from-suspend.  GLib.get_monotonic_time
        // returns microseconds and is unambiguous about delta semantics.
        const FPS = 60;
        let lastTickUs = GLib.get_monotonic_time();
        this._timeline = new Clutter.Timeline({
            duration: 1000,
            repeat_count: -1,
        });
        this._timeline.connect('new-frame', () => {
            const nowUs = GLib.get_monotonic_time();
            const deltaSec = (nowUs - lastTickUs) / 1_000_000;
            lastTickUs = nowUs;
            // Clamp catch-up after suspend: a 5-minute pause shouldn't
            // produce a visible spin when the screen wakes up.
            const step = speed * FPS * Math.min(deltaSec, 0.1);
            this._gradientAngle = (this._gradientAngle + step) % 360;
            this._invalidateCanvas();
        });
        this._timeline.start();
    }

    _stopTimeline() {
        if (this._timeline) {
            this._timeline.stop();
            this._timeline = null;
        }
    }

    // =========================================================================
    // Focus tracking
    // =========================================================================

    _onFocusChanged() {
        // Disconnect signals from the previous window
        this._windowSignals.destroy();

        const win = global.display.get_focus_window();

        if (!win || win.is_fullscreen() || win.minimized) {
            this._border.hide();
            this._focusWindow = null;
            return;
        }

        this._focusWindow = win;

        this._windowSignals.connect(win, 'position-changed',
            () => this._updateGeometryAnimated());
        this._windowSignals.connect(win, 'size-changed',
            () => this._updateGeometryAnimated());

        // Snap geometry on focus switch
        this._updateGeometry();
        this._restack();
        this._border.show();

        // Focus pulse effect
        if (this._settings.get_boolean('focus-pulse'))
            this._doPulse();
    }

    // =========================================================================
    // Focus pulse
    // =========================================================================

    _doPulse() {
        if (!this._border)
            return;

        this._border.set_pivot_point(0.5, 0.5);
        this._border.remove_all_transitions();

        // First update geometry so border is in the right place
        this._updateGeometry();

        // Pulse the border
        this._border.ease({
            scale_x: PULSE_SCALE,
            scale_y: PULSE_SCALE,
            duration: PULSE_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                try {
                    this._border.ease({
                        scale_x: 1.0,
                        scale_y: 1.0,
                        duration: PULSE_SETTLE_MS,
                        mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
                    });
                } catch (_e) {
                    // Border may be destroyed
                }
            },
        });

        // Pulse the window actor too
        this._pulseWindowActor();
    }

    _pulseWindowActor() {
        if (!this._focusWindow)
            return;

        const actor = this._focusWindow.get_compositor_private();
        if (!actor)
            return;

        try {
            actor.set_pivot_point(0.5, 0.5);
            actor.remove_all_transitions();

            actor.ease({
                scale_x: PULSE_SCALE,
                scale_y: PULSE_SCALE,
                duration: PULSE_DURATION_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    try {
                        actor.ease({
                            scale_x: 1.0,
                            scale_y: 1.0,
                            duration: PULSE_SETTLE_MS,
                            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
                        });
                    } catch (_e) {
                        // Actor may be destroyed
                    }
                },
            });
        } catch (_e) {
            // Window may have been destroyed
        }
    }

    // =========================================================================
    // Geometry & style
    // =========================================================================

    _updateGeometry() {
        if (!this._focusWindow || !this._border)
            return;

        try {
            const rect = this._focusWindow.get_frame_rect();
            const bw = this._settings.get_int('active-border-size');

            this._border.remove_all_transitions();
            this._border.set_position(rect.x - bw, rect.y - bw);
            this._border.set_size(rect.width + bw * 2, rect.height + bw * 2);
            this._border.set_scale(1, 1);

            if (this._isGradient)
                this._invalidateCanvas();
        } catch (_e) {
            // Window may have been destroyed
        }
    }

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
            const dur = this._settings.get_int('animation-duration');

            if (this._isGradient) {
                // For gradient mode, ease position/size directly
                this._border.remove_all_transitions();
                this._border.ease({
                    x: rect.x - bw,
                    y: rect.y - bw,
                    width: rect.width + bw * 2,
                    height: rect.height + bw * 2,
                    duration: dur,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            } else {
                animateBorder(this._border, rect, bw, dur);
            }
        } catch (_e) {
            // Window may have been destroyed
        }
    }

    _updateSolidStyle() {
        if (!this._border || this._isGradient)
            return;

        const color = this._settings.get_string('active-border-color');
        const width = this._settings.get_int('active-border-size');
        const radius = this._settings.get_int('active-border-radius');

        this._border.set_style(
            `border-width: ${width}px; border-color: ${color}; border-radius: ${radius}px;`,
        );
    }

    _onStyleSettingsChanged() {
        if (this._isGradient) {
            // Gradient mode — just repaint the canvas
            this._invalidateCanvas();
        } else {
            this._updateSolidStyle();
        }
        this._updateGeometry();
    }

    _onGradientSettingsChanged() {
        // Mode may have changed — rebuild
        const secondary = this._settings.get_string('active-border-color-secondary');
        const primary = this._settings.get_string('active-border-color');
        const shouldBeGradient = secondary !== '' && secondary !== primary;

        if (shouldBeGradient !== this._isGradient) {
            this._rebuildBorder();
        } else if (this._isGradient) {
            this._gradientAngle = this._settings.get_int('active-border-gradient-angle');
            this._invalidateCanvas();
        }
    }

    _onGradientSpeedChanged() {
        if (!this._isGradient)
            return;
        this._stopTimeline();
        this._startTimeline();
    }

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
