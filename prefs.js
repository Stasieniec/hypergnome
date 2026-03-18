import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _}
    from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class HyperGnomePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // -- General Page --
        const generalPage = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(generalPage);

        // Indicator group
        const indicatorGroup = new Adw.PreferencesGroup({
            title: _('Panel Indicator'),
        });
        generalPage.add(indicatorGroup);

        const showIndicatorRow = new Adw.SwitchRow({
            title: _('Show Indicator'),
            subtitle: _('Show the HyperGnome icon in the top panel'),
        });
        indicatorGroup.add(showIndicatorRow);
        settings.bind('show-indicator', showIndicatorRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        // Tiling group
        const tilingGroup = new Adw.PreferencesGroup({
            title: _('Tiling'),
        });
        generalPage.add(tilingGroup);

        const tilingEnabledRow = new Adw.SwitchRow({
            title: _('Enable Tiling'),
            subtitle: _('Automatically tile windows using dwindle layout'),
        });
        tilingGroup.add(tilingEnabledRow);
        settings.bind('tiling-enabled', tilingEnabledRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        const splitRatioRow = new Adw.SpinRow({
            title: _('Default Split Ratio'),
            subtitle: _('Ratio when splitting a new window (0.1 - 0.9)'),
            adjustment: new Gtk.Adjustment({
                lower: 0.1,
                upper: 0.9,
                step_increment: 0.05,
                page_increment: 0.1,
            }),
            digits: 2,
        });
        tilingGroup.add(splitRatioRow);
        settings.bind('split-ratio', splitRatioRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        // -- Appearance Page --
        const appearancePage = new Adw.PreferencesPage({
            title: _('Appearance'),
            icon_name: 'applications-graphics-symbolic',
        });
        window.add(appearancePage);

        // Gaps group
        const gapsGroup = new Adw.PreferencesGroup({
            title: _('Gaps'),
            description: _('Spacing between tiled windows'),
        });
        appearancePage.add(gapsGroup);

        const innerGapRow = new Adw.SpinRow({
            title: _('Inner Gap'),
            subtitle: _('Gap between windows (pixels)'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 64,
                step_increment: 1,
                page_increment: 5,
            }),
        });
        gapsGroup.add(innerGapRow);
        settings.bind('inner-gap', innerGapRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        const outerGapRow = new Adw.SpinRow({
            title: _('Outer Gap'),
            subtitle: _('Gap between windows and screen edges (pixels)'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 64,
                step_increment: 1,
                page_increment: 5,
            }),
        });
        gapsGroup.add(outerGapRow);
        settings.bind('outer-gap', outerGapRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        // Active border group
        const borderGroup = new Adw.PreferencesGroup({
            title: _('Active Window Border'),
            description: _('Highlight the focused window'),
        });
        appearancePage.add(borderGroup);

        const borderSizeRow = new Adw.SpinRow({
            title: _('Border Width'),
            subtitle: _('Width of the active window border (pixels)'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 10,
                step_increment: 1,
            }),
        });
        borderGroup.add(borderSizeRow);
        settings.bind('active-border-size', borderSizeRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        const borderRadiusRow = new Adw.SpinRow({
            title: _('Border Radius'),
            subtitle: _('Corner rounding of the active border (pixels)'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 24,
                step_increment: 1,
            }),
        });
        borderGroup.add(borderRadiusRow);
        settings.bind('active-border-radius', borderRadiusRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        const borderColorRow = new Adw.EntryRow({
            title: _('Border Color'),
            text: settings.get_string('active-border-color'),
        });
        borderGroup.add(borderColorRow);
        borderColorRow.connect('changed', () => {
            settings.set_string('active-border-color', borderColorRow.get_text());
        });
        settings.connect('changed::active-border-color', () => {
            const current = settings.get_string('active-border-color');
            if (borderColorRow.get_text() !== current)
                borderColorRow.set_text(current);
        });

        const borderColorSecondaryRow = new Adw.EntryRow({
            title: _('Secondary Color (gradient)'),
            text: settings.get_string('active-border-color-secondary'),
        });
        borderGroup.add(borderColorSecondaryRow);
        borderColorSecondaryRow.connect('changed', () => {
            settings.set_string('active-border-color-secondary',
                borderColorSecondaryRow.get_text());
        });
        settings.connect('changed::active-border-color-secondary', () => {
            const current = settings.get_string('active-border-color-secondary');
            if (borderColorSecondaryRow.get_text() !== current)
                borderColorSecondaryRow.set_text(current);
        });

        const gradientAngleRow = new Adw.SpinRow({
            title: _('Gradient Angle'),
            subtitle: _('Angle of the border gradient in degrees'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 360,
                step_increment: 15,
                page_increment: 45,
            }),
        });
        borderGroup.add(gradientAngleRow);
        settings.bind('active-border-gradient-angle', gradientAngleRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        const gradientSpeedRow = new Adw.SpinRow({
            title: _('Gradient Rotation Speed'),
            subtitle: _('Degrees per frame (0 = static)'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 10,
                step_increment: 0.5,
                page_increment: 1,
            }),
            digits: 1,
        });
        borderGroup.add(gradientSpeedRow);
        settings.bind('active-border-gradient-speed', gradientSpeedRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        const focusPulseRow = new Adw.SwitchRow({
            title: _('Focus Pulse'),
            subtitle: _('Brief scale pulse on the border when focus changes'),
        });
        borderGroup.add(focusPulseRow);
        settings.bind('focus-pulse', focusPulseRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        // Inactive window effects group
        const effectsGroup = new Adw.PreferencesGroup({
            title: _('Inactive Window Effects'),
            description: _('Visual effects for unfocused windows'),
        });
        appearancePage.add(effectsGroup);

        const dimInactiveRow = new Adw.SwitchRow({
            title: _('Dim Inactive Windows'),
            subtitle: _('Desaturate unfocused windows for visual emphasis'),
        });
        effectsGroup.add(dimInactiveRow);
        settings.bind('dim-inactive', dimInactiveRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        const dimStrengthRow = new Adw.SpinRow({
            title: _('Dim Strength'),
            subtitle: _('How much to desaturate inactive windows (0.0 - 1.0)'),
            adjustment: new Gtk.Adjustment({
                lower: 0.0,
                upper: 1.0,
                step_increment: 0.05,
                page_increment: 0.1,
            }),
            digits: 2,
        });
        effectsGroup.add(dimStrengthRow);
        settings.bind('dim-strength', dimStrengthRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        // Animations group
        const animGroup = new Adw.PreferencesGroup({
            title: _('Animations'),
        });
        appearancePage.add(animGroup);

        const animEnabledRow = new Adw.SwitchRow({
            title: _('Enable Animations'),
            subtitle: _('Smooth window open/close and tiling animations'),
        });
        animGroup.add(animEnabledRow);
        settings.bind('animation-enabled', animEnabledRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        // Keep settings alive for the window lifetime
        window._settings = settings;
    }
}
