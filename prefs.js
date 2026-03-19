import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
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

        const resizeStepRow = new Adw.SpinRow({
            title: _('Resize Step'),
            subtitle: _('How much to resize per keypress (0.01 - 0.25)'),
            adjustment: new Gtk.Adjustment({
                lower: 0.01,
                upper: 0.25,
                step_increment: 0.01,
                page_increment: 0.05,
            }),
            digits: 2,
        });
        tilingGroup.add(resizeStepRow);
        settings.bind('resize-step', resizeStepRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        // Float exceptions group
        const floatGroup = new Adw.PreferencesGroup({
            title: _('Float Exceptions'),
            description: _('Windows matching these WM_CLASS values will always float'),
        });
        generalPage.add(floatGroup);

        this._buildFloatList(floatGroup, settings);

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

        // Color pickers
        this._addColorRow(borderGroup, settings,
            'active-border-color', _('Border Color'));
        this._addColorRow(borderGroup, settings,
            'active-border-color-secondary',
            _('Secondary Color'), _('Empty for solid color'));

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
            subtitle: _('Brief scale pulse on window and border when focus changes'),
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

        const animDurationRow = new Adw.SpinRow({
            title: _('Animation Duration'),
            subtitle: _('Speed of animations in milliseconds (50 - 500)'),
            adjustment: new Gtk.Adjustment({
                lower: 50,
                upper: 500,
                step_increment: 25,
                page_increment: 50,
            }),
        });
        animGroup.add(animDurationRow);
        settings.bind('animation-duration', animDurationRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        // Keep settings alive for the window lifetime
        window._settings = settings;
    }

    // =========================================================================
    // Color picker helper
    // =========================================================================

    _addColorRow(group, settings, key, title, subtitle) {
        const colorDialog = new Gtk.ColorDialog();
        const rgba = new Gdk.RGBA();
        const colorStr = settings.get_string(key);
        if (!rgba.parse(colorStr))
            rgba.parse('#2664d2');

        const colorButton = new Gtk.ColorDialogButton({
            dialog: colorDialog,
            rgba,
            valign: Gtk.Align.CENTER,
        });

        const row = new Adw.ActionRow({
            title,
            subtitle: subtitle ?? null,
        });
        row.add_suffix(colorButton);
        row.activatable_widget = colorButton;
        group.add(row);

        // Sync button -> settings
        colorButton.connect('notify::rgba', () => {
            const c = colorButton.get_rgba();
            const str = `rgb(${Math.round(c.red * 255)},${Math.round(c.green * 255)},${Math.round(c.blue * 255)})`;
            if (settings.get_string(key) !== str)
                settings.set_string(key, str);
        });

        // Sync settings -> button
        settings.connect(`changed::${key}`, () => {
            const current = settings.get_string(key);
            const c = new Gdk.RGBA();
            if (c.parse(current))
                colorButton.set_rgba(c);
        });
    }

    // =========================================================================
    // Float list editor
    // =========================================================================

    _buildFloatList(group, settings) {
        const listBox = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list'],
        });
        group.add(listBox);

        const refreshList = () => {
            // Remove all children
            let child = listBox.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                listBox.remove(child);
                child = next;
            }

            const entries = settings.get_strv('float-list');
            for (const wmClass of entries) {
                const row = new Adw.ActionRow({title: wmClass});
                const removeBtn = new Gtk.Button({
                    icon_name: 'list-remove-symbolic',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat'],
                });
                removeBtn.connect('clicked', () => {
                    const current = settings.get_strv('float-list');
                    settings.set_strv('float-list',
                        current.filter(c => c !== wmClass));
                });
                row.add_suffix(removeBtn);
                listBox.append(row);
            }

            if (entries.length === 0) {
                const emptyRow = new Adw.ActionRow({
                    title: _('No exceptions'),
                    subtitle: _('All normal windows will be tiled'),
                });
                listBox.append(emptyRow);
            }
        };

        // Add entry + button
        const addRow = new Adw.EntryRow({
            title: _('WM_CLASS to add'),
        });
        group.add(addRow);

        const addBtn = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        addRow.add_suffix(addBtn);

        const doAdd = () => {
            const text = addRow.get_text().trim();
            if (!text)
                return;
            const current = settings.get_strv('float-list');
            if (!current.includes(text)) {
                current.push(text);
                settings.set_strv('float-list', current);
            }
            addRow.set_text('');
        };

        addBtn.connect('clicked', doAdd);
        addRow.connect('entry-activated', doAdd);

        settings.connect('changed::float-list', refreshList);
        refreshList();
    }
}
