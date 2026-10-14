import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
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

        // Layout group
        const layoutGroup = new Adw.PreferencesGroup({
            title: _('Layout'),
            description: _('Choose between dwindle (BSP) and master/stack tiling'),
        });
        generalPage.add(layoutGroup);

        // Layout mode dropdown
        const layoutModel = new Gtk.StringList();
        layoutModel.append(_('Dwindle (BSP)'));
        layoutModel.append(_('Master / Stack'));
        const LAYOUT_VALUES = ['dwindle', 'master'];

        const layoutRow = new Adw.ComboRow({
            title: _('Layout Mode'),
            subtitle: _('Dwindle splits each new window in half; master gives one window a fixed share with the rest stacked'),
            model: layoutModel,
        });
        layoutRow.set_selected(
            LAYOUT_VALUES.indexOf(settings.get_string('layout-mode')));
        layoutRow.connect('notify::selected', () => {
            settings.set_string('layout-mode', LAYOUT_VALUES[layoutRow.get_selected()]);
        });
        settings.connect('changed::layout-mode', () => {
            const idx = LAYOUT_VALUES.indexOf(settings.get_string('layout-mode'));
            if (layoutRow.get_selected() !== idx)
                layoutRow.set_selected(idx);
        });
        layoutGroup.add(layoutRow);

        // Master orientation dropdown
        const orientationModel = new Gtk.StringList();
        for (const lbl of [_('Left'), _('Right'), _('Top'), _('Bottom')])
            orientationModel.append(lbl);
        const ORIENT_VALUES = ['left', 'right', 'top', 'bottom'];

        const orientationRow = new Adw.ComboRow({
            title: _('Master Orientation'),
            subtitle: _('Which side of the screen the master window occupies'),
            model: orientationModel,
        });
        orientationRow.set_selected(
            ORIENT_VALUES.indexOf(settings.get_string('master-orientation')));
        orientationRow.connect('notify::selected', () => {
            settings.set_string('master-orientation',
                ORIENT_VALUES[orientationRow.get_selected()]);
        });
        settings.connect('changed::master-orientation', () => {
            const idx = ORIENT_VALUES.indexOf(settings.get_string('master-orientation'));
            if (orientationRow.get_selected() !== idx)
                orientationRow.set_selected(idx);
        });
        layoutGroup.add(orientationRow);

        // Master area ratio slider
        const masterFactorRow = new Adw.SpinRow({
            title: _('Master Area Ratio'),
            subtitle: _('Fraction of the work area used by the master window'),
            adjustment: new Gtk.Adjustment({
                lower: 0.1,
                upper: 0.9,
                step_increment: 0.05,
                page_increment: 0.1,
            }),
            digits: 2,
        });
        layoutGroup.add(masterFactorRow);
        settings.bind('master-factor', masterFactorRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        // Disable orientation + ratio when not in master mode
        const updateSensitivity = () => {
            const isMaster = settings.get_string('layout-mode') === 'master';
            orientationRow.set_sensitive(isMaster);
            masterFactorRow.set_sensitive(isMaster);
        };
        updateSensitivity();
        settings.connect('changed::layout-mode', updateSensitivity);

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

        // -- Keybindings Page --
        const keybindingsPage = new Adw.PreferencesPage({
            title: _('Keybindings'),
            icon_name: 'input-keyboard-symbolic',
        });
        window.add(keybindingsPage);

        this._buildKeybindingsPage(keybindingsPage, settings, window);

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

    // =========================================================================
    // Keybindings page
    // =========================================================================

    _buildKeybindingsPage(page, settings, prefsWindow) {
        // -- GNOME Integration (master override toggle) --
        const integrationGroup = new Adw.PreferencesGroup({
            title: _('GNOME Integration'),
            description: _('Control whether HyperGnome takes over conflicting GNOME shortcuts.'),
        });
        page.add(integrationGroup);

        const overrideRow = new Adw.SwitchRow({
            title: _('Override Conflicting GNOME Shortcuts'),
            subtitle: _('Required for default HyperGnome bindings to work. When off, conflicting shortcuts (Super+H, Super+1..9, Super+Arrows, etc.) keep their GNOME meaning; rebind HyperGnome shortcuts below if needed.'),
        });
        integrationGroup.add(overrideRow);
        settings.bind('override-gnome-shortcuts', overrideRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        // Static overrides — these are always active when the extension is enabled
        const STATIC_OVERRIDES = [
            {
                gnomeName: 'minimize',
                gnomeLabel: 'Minimize Window',
                schema: 'org.gnome.desktop.wm.keybindings',
                replacement: 'Disabled (Focus Left uses Super+H)',
            },
            {
                gnomeName: 'toggle-tiled-left',
                gnomeLabel: 'Tile Window Left',
                schema: 'org.gnome.mutter.keybindings',
                replacement: 'Replaced by Focus Left',
            },
            {
                gnomeName: 'toggle-tiled-right',
                gnomeLabel: 'Tile Window Right',
                schema: 'org.gnome.mutter.keybindings',
                replacement: 'Replaced by Focus Right',
            },
            {
                gnomeName: 'unmaximize',
                gnomeLabel: 'Unmaximize Window',
                schema: 'org.gnome.desktop.wm.keybindings',
                replacement: 'Replaced by Focus Down',
            },
            {
                gnomeName: 'move-to-monitor-left',
                gnomeLabel: 'Move Window to Monitor on Left',
                schema: 'org.gnome.desktop.wm.keybindings',
                replacement: 'Replaced by Move Left',
            },
            {
                gnomeName: 'move-to-monitor-right',
                gnomeLabel: 'Move Window to Monitor on Right',
                schema: 'org.gnome.desktop.wm.keybindings',
                replacement: 'Replaced by Move Right',
            },
            {
                gnomeName: 'move-to-monitor-up',
                gnomeLabel: 'Move Window to Monitor Above',
                schema: 'org.gnome.desktop.wm.keybindings',
                replacement: 'Replaced by Move Up',
            },
            {
                gnomeName: 'move-to-monitor-down',
                gnomeLabel: 'Move Window to Monitor Below',
                schema: 'org.gnome.desktop.wm.keybindings',
                replacement: 'Replaced by Move Down',
            },
            {
                gnomeName: 'switch-to-application-1',
                gnomeLabel: 'Activate Favourite App 1',
                schema: 'org.gnome.shell.keybindings',
                replacement: 'Disabled (Super+1 switches workspace)',
            },
            {
                gnomeName: 'switch-to-application-2',
                gnomeLabel: 'Activate Favourite App 2',
                schema: 'org.gnome.shell.keybindings',
                replacement: 'Disabled (Super+2 switches workspace)',
            },
            {
                gnomeName: 'switch-to-application-3',
                gnomeLabel: 'Activate Favourite App 3',
                schema: 'org.gnome.shell.keybindings',
                replacement: 'Disabled (Super+3 switches workspace)',
            },
            {
                gnomeName: 'switch-to-application-4',
                gnomeLabel: 'Activate Favourite App 4',
                schema: 'org.gnome.shell.keybindings',
                replacement: 'Disabled (Super+4 switches workspace)',
            },
            {
                gnomeName: 'switch-to-application-5',
                gnomeLabel: 'Activate Favourite App 5',
                schema: 'org.gnome.shell.keybindings',
                replacement: 'Disabled (Super+5 switches workspace)',
            },
            {
                gnomeName: 'switch-to-application-6',
                gnomeLabel: 'Activate Favourite App 6',
                schema: 'org.gnome.shell.keybindings',
                replacement: 'Disabled (Super+6 switches workspace)',
            },
            {
                gnomeName: 'switch-to-application-7',
                gnomeLabel: 'Activate Favourite App 7',
                schema: 'org.gnome.shell.keybindings',
                replacement: 'Disabled (Super+7 switches workspace)',
            },
            {
                gnomeName: 'switch-to-application-8',
                gnomeLabel: 'Activate Favourite App 8',
                schema: 'org.gnome.shell.keybindings',
                replacement: 'Disabled (Super+8 switches workspace)',
            },
            {
                gnomeName: 'switch-to-application-9',
                gnomeLabel: 'Activate Favourite App 9',
                schema: 'org.gnome.shell.keybindings',
                replacement: 'Disabled (Super+9 switches workspace)',
            },
        ];

        // Our keybinding definitions grouped by category
        const BINDING_GROUPS = [
            {
                title: _('Focus'),
                bindings: [
                    {key: 'tile-focus-left', label: _('Focus Left')},
                    {key: 'tile-focus-down', label: _('Focus Down')},
                    {key: 'tile-focus-up', label: _('Focus Up')},
                    {key: 'tile-focus-right', label: _('Focus Right')},
                ],
            },
            {
                title: _('Move Window'),
                bindings: [
                    {key: 'tile-move-left', label: _('Move Left')},
                    {key: 'tile-move-down', label: _('Move Down')},
                    {key: 'tile-move-up', label: _('Move Up')},
                    {key: 'tile-move-right', label: _('Move Right')},
                ],
            },
            {
                title: _('Resize Window'),
                bindings: [
                    {key: 'tile-resize-left', label: _('Resize Left')},
                    {key: 'tile-resize-down', label: _('Resize Down')},
                    {key: 'tile-resize-up', label: _('Resize Up')},
                    {key: 'tile-resize-right', label: _('Resize Right')},
                ],
            },
            {
                title: _('Actions'),
                bindings: [
                    {key: 'tile-toggle-float', label: _('Toggle Float')},
                    {key: 'tile-close-window', label: _('Close Window')},
                    {key: 'tile-toggle-split', label: _('Toggle Split')},
                    {key: 'tile-equalize', label: _('Equalize Splits')},
                ],
            },
            {
                title: _('Master Layout'),
                bindings: [
                    {key: 'tile-swap-master', label: _('Swap with Master')},
                    {key: 'tile-focus-master', label: _('Focus Master')},
                    {key: 'tile-cycle-orientation', label: _('Cycle Master Orientation')},
                ],
            },
            {
                title: _('Workspaces'),
                bindings: [
                    {key: 'tile-workspace-1', label: _('Switch to Workspace 1')},
                    {key: 'tile-workspace-2', label: _('Switch to Workspace 2')},
                    {key: 'tile-workspace-3', label: _('Switch to Workspace 3')},
                    {key: 'tile-workspace-4', label: _('Switch to Workspace 4')},
                    {key: 'tile-workspace-5', label: _('Switch to Workspace 5')},
                    {key: 'tile-workspace-6', label: _('Switch to Workspace 6')},
                    {key: 'tile-workspace-7', label: _('Switch to Workspace 7')},
                    {key: 'tile-workspace-8', label: _('Switch to Workspace 8')},
                    {key: 'tile-workspace-9', label: _('Switch to Workspace 9')},
                    {key: 'tile-workspace-10', label: _('Switch to Workspace 10')},
                    {key: 'tile-workspace-prev', label: _('Cycle to Previous Workspace')},
                    {key: 'tile-workspace-next', label: _('Cycle to Next Workspace')},
                    {key: 'tile-move-to-workspace-1', label: _('Move Window to Workspace 1')},
                    {key: 'tile-move-to-workspace-2', label: _('Move Window to Workspace 2')},
                    {key: 'tile-move-to-workspace-3', label: _('Move Window to Workspace 3')},
                    {key: 'tile-move-to-workspace-4', label: _('Move Window to Workspace 4')},
                    {key: 'tile-move-to-workspace-5', label: _('Move Window to Workspace 5')},
                    {key: 'tile-move-to-workspace-6', label: _('Move Window to Workspace 6')},
                    {key: 'tile-move-to-workspace-7', label: _('Move Window to Workspace 7')},
                    {key: 'tile-move-to-workspace-8', label: _('Move Window to Workspace 8')},
                    {key: 'tile-move-to-workspace-9', label: _('Move Window to Workspace 9')},
                    {key: 'tile-move-to-workspace-10', label: _('Move Window to Workspace 10')},
                    {key: 'tile-move-workspace-prev', label: _('Move Window to Previous Workspace')},
                    {key: 'tile-move-workspace-next', label: _('Move Window to Next Workspace')},
                ],
            },
        ];

        // -- Overridden GNOME Shortcuts --
        const overrideGroup = new Adw.PreferencesGroup({
            title: _('Overridden GNOME Shortcuts'),
            description: _('These GNOME shortcuts are replaced while HyperGnome is active. They are restored when the extension is disabled.'),
        });
        page.add(overrideGroup);

        for (const override of STATIC_OVERRIDES) {
            const accels = this._getSystemAccelerators(
                override.schema, override.gnomeName);
            const accelStr = accels.length > 0
                ? accels.join(', ')
                : 'unset';

            const row = new Adw.ActionRow({
                title: override.gnomeLabel,
                subtitle: override.replacement,
            });

            // Show the original GNOME accelerator(s)
            const box = new Gtk.Box({
                spacing: 4,
                valign: Gtk.Align.CENTER,
            });
            for (const accel of accels) {
                box.append(new Gtk.ShortcutLabel({
                    accelerator: accel,
                    disabled_text: accelStr,
                }));
            }
            if (accels.length === 0) {
                box.append(new Gtk.Label({
                    label: 'unset',
                    css_classes: ['dim-label'],
                }));
            }
            row.add_suffix(box);
            overrideGroup.add(row);
        }

        // -- Dynamic conflicts (refreshed when HyperGnome shortcuts change) --
        const conflictGroup = new Adw.PreferencesGroup({
            title: _('Additional Conflicts Detected'),
            description: _('These GNOME shortcuts use the same keys as HyperGnome bindings. HyperGnome takes priority while the extension is active.'),
        });
        page.add(conflictGroup);
        const conflictRows = [];
        this._refreshDynamicConflictsGroup(
            conflictGroup, conflictRows, settings, STATIC_OVERRIDES);

        const onBindingChanged = () => {
            this._refreshDynamicConflictsGroup(
                conflictGroup, conflictRows, settings, STATIC_OVERRIDES);
        };

        // -- HyperGnome Keybindings --
        for (const [groupIndex, group] of BINDING_GROUPS.entries()) {
            const groupProps = {title: group.title};
            if (groupIndex === 0) {
                groupProps.description = _(
                    'Select a row to add, remove, or reset shortcuts. Changes apply immediately in GNOME Shell.');
            }
            const prefsGroup = new Adw.PreferencesGroup(groupProps);
            page.add(prefsGroup);

            for (const binding of group.bindings) {
                this._addEditableKeybindingRow(
                    prefsGroup,
                    settings,
                    prefsWindow,
                    binding,
                    onBindingChanged);
            }
        }
    }

    _populateAcceleratorBox(box, accels) {
        let child = box.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            box.remove(child);
            child = next;
        }

        const nonEmpty = accels.filter(a => a && a !== '');
        if (nonEmpty.length === 0) {
            box.append(new Gtk.Label({
                label: _('Disabled'),
                css_classes: ['dim-label'],
            }));
            return;
        }

        for (const accel of nonEmpty)
            box.append(new Gtk.ShortcutLabel({accelerator: accel}));
    }

    _trackSettingsHandler(prefsWindow, settings, handlerId) {
        if (!prefsWindow._hypergnomeSettingsHandlers) {
            prefsWindow._hypergnomeSettingsHandlers = [];
            prefsWindow.connect('destroy', () => {
                for (const {settings: s, id} of prefsWindow._hypergnomeSettingsHandlers) {
                    try {
                        s.disconnect(id);
                    } catch (_e) {
                        // Already disconnected
                    }
                }
                prefsWindow._hypergnomeSettingsHandlers = null;
            });
        }
        prefsWindow._hypergnomeSettingsHandlers.push({settings, id: handlerId});
    }

    _getKeybindingDescription(settings, key) {
        try {
            const schemaKey = settings.get_settings_schema()?.get_key(key);
            if (!schemaKey)
                return '';
            return schemaKey.get_description() || schemaKey.get_summary() || '';
        } catch (_e) {
            return '';
        }
    }

    _addEditableKeybindingRow(group, settings, prefsWindow, binding, onChanged) {
        const accelBox = new Gtk.Box({
            spacing: 4,
            valign: Gtk.Align.CENTER,
        });

        const description = this._getKeybindingDescription(settings, binding.key);
        const rowProps = {
            title: binding.label,
            activatable: true,
        };
        if (description)
            rowProps.subtitle = description;
        const row = new Adw.ActionRow(rowProps);
        row.add_suffix(accelBox);
        group.add(row);

        const refreshSuffix = () => {
            this._populateAcceleratorBox(
                accelBox, settings.get_strv(binding.key));
        };
        refreshSuffix();

        const changedId = settings.connect(
            `changed::${binding.key}`, () => {
                refreshSuffix();
                onChanged?.();
            });
        this._trackSettingsHandler(prefsWindow, settings, changedId);

        row.connect('activated', () => {
            this._openKeybindingEditorDialog(
                prefsWindow,
                settings,
                binding.key,
                binding.label);
        });
    }

    _setBindingAccelerators(settings, bindingKey, accels) {
        settings.set_strv(
            bindingKey,
            accels.filter(a => a && a !== ''));
    }

    _keyEventToAccelerator(keyval, keycode, state) {
        if (this._isModifierKey(keyval))
            return null;

        const key = Gdk.keyval_to_lower(keyval);
        const modifiers = state & Gtk.accelerator_get_default_mod_mask();

        if (Gtk.accelerator_valid(key, modifiers))
            return Gtk.accelerator_name(key, modifiers);

        try {
            const fallback = Gtk.accelerator_name_with_keycode(
                null, keyval, keycode, modifiers);
            if (fallback && fallback.length > 0)
                return fallback;
        } catch (_e) {
            // Not available on this GTK version
        }

        return null;
    }

    _openKeybindingEditorDialog(prefsWindow, settings, bindingKey, title) {
        if (prefsWindow._hypergnomeActiveKeyDialog) {
            const existing = prefsWindow._hypergnomeActiveKeyDialog;
            if (typeof existing.close === 'function')
                existing.close();
            else
                existing.destroy();
            prefsWindow._hypergnomeActiveKeyDialog = null;
        }

        const listBox = new Gtk.ListBox({
            css_classes: ['boxed-list'],
            selection_mode: Gtk.SelectionMode.NONE,
        });

        const hintLabel = new Gtk.Label({
            label: _(
                'Press a key combination to add a shortcut. Backspace clears all. Escape closes.'),
            wrap: true,
            xalign: 0,
        });

        const captureStatus = new Gtk.Label({
            label: _('Listening for shortcut…'),
            css_classes: ['dim-label'],
            wrap: true,
            xalign: 0.5,
        });

        const captureArea = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8,
        });
        captureArea.append(hintLabel);
        captureArea.append(captureStatus);

        const captureFrame = new Gtk.Frame();
        captureFrame.set_child(captureArea);

        const refreshList = () => {
            let child = listBox.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                listBox.remove(child);
                child = next;
            }

            const accels = settings.get_strv(bindingKey).filter(a => a && a !== '');
            if (accels.length === 0) {
                const emptyRow = new Adw.ActionRow({
                    title: _('No shortcuts assigned'),
                });
                listBox.append(new Gtk.ListBoxRow({child: emptyRow}));
                return;
            }

            for (const accel of accels) {
                const removeButton = new Gtk.Button({
                    icon_name: 'user-trash-symbolic',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat'],
                    tooltip_text: _('Remove shortcut'),
                });
                removeButton.connect('clicked', () => {
                    const current = settings.get_strv(bindingKey)
                        .filter(a => a && a !== '');
                    this._setBindingAccelerators(
                        settings, bindingKey, current.filter(a => a !== accel));
                    refreshList();
                });

                const rowBox = new Gtk.Box({
                    spacing: 12,
                    margin_top: 8,
                    margin_bottom: 8,
                    margin_start: 12,
                    margin_end: 12,
                });
                rowBox.append(new Gtk.ShortcutLabel({
                    accelerator: accel,
                    halign: Gtk.Align.START,
                    hexpand: true,
                }));
                rowBox.append(removeButton);
                listBox.append(new Gtk.ListBoxRow({child: rowBox}));
            }
        };

        const resetButton = new Gtk.Button({label: _('Reset to Default')});
        resetButton.connect('clicked', () => {
            settings.reset(bindingKey);
            refreshList();
        });

        const doneButton = new Gtk.Button({
            label: _('Done'),
            css_classes: ['suggested-action'],
        });

        const buttonRow = new Gtk.Box({
            spacing: 12,
            margin_top: 12,
            halign: Gtk.Align.END,
        });
        buttonRow.append(resetButton);
        buttonRow.append(doneButton);

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 24,
            margin_start: 12,
            margin_end: 12,
        });
        content.append(captureFrame);
        content.append(listBox);
        content.append(buttonRow);

        content.set_focusable(true);
        content.set_can_focus(true);
        content.set_focus_on_click(true);
        captureArea.set_focusable(true);
        captureArea.set_can_focus(true);
        captureArea.set_focus_on_click(true);

        let dialog = null;
        const closeDialog = () => {
            if (!dialog)
                return;
            if (typeof dialog.close === 'function')
                dialog.close();
            else
                dialog.destroy();
            if (prefsWindow._hypergnomeActiveKeyDialog === dialog)
                prefsWindow._hypergnomeActiveKeyDialog = null;
        };

        const handleKeyCapture = (_ctrl, keyval, keycode, state) => {
            if (keyval === Gdk.KEY_Escape) {
                closeDialog();
                return Gdk.EVENT_STOP;
            }

            if (keyval === Gdk.KEY_BackSpace || keyval === Gdk.KEY_Delete) {
                if ((state & Gtk.accelerator_get_default_mod_mask()) === 0) {
                    this._setBindingAccelerators(settings, bindingKey, []);
                    captureStatus.label = _('All shortcuts cleared');
                    refreshList();
                    return Gdk.EVENT_STOP;
                }
            }

            const accel = this._keyEventToAccelerator(keyval, keycode, state);
            if (!accel) {
                if (this._isModifierKey(keyval))
                    captureStatus.label = _('Press another key with the modifier…');
                return Gdk.EVENT_STOP;
            }

            const current = settings.get_strv(bindingKey).filter(a => a && a !== '');
            const exists = current.some(
                a => a.toLowerCase() === accel.toLowerCase());
            if (!exists) {
                this._setBindingAccelerators(
                    settings, bindingKey, [...current, accel]);
                captureStatus.label = _('Added: %s').replace('%s', accel);
            } else {
                captureStatus.label = _('Already assigned: %s').replace('%s', accel);
            }
            refreshList();
            return Gdk.EVENT_STOP;
        };

        const keyController = new Gtk.EventControllerKey({
            propagation_phase: Gtk.PropagationPhase.CAPTURE,
        });
        keyController.connect('key-pressed', handleKeyCapture);

        doneButton.connect('clicked', closeDialog);

        const attachKeyCapture = (widget) => {
            widget.add_controller(keyController);
        };

        if (Adw.Dialog) {
            dialog = new Adw.Dialog({
                title,
                content_width: 440,
                content_height: 420,
                child: content,
            });
            dialog.connect('closed', () => {
                prefsWindow._hypergnomeActiveKeyDialog = null;
            });
            attachKeyCapture(dialog);
            prefsWindow._hypergnomeActiveKeyDialog = dialog;
            refreshList();
            dialog.present(prefsWindow);
            if (typeof dialog.set_focus === 'function')
                dialog.set_focus(content);
        } else {
            dialog = new Adw.Window({
                title,
                transient_for: prefsWindow,
                modal: true,
                default_width: 440,
                default_height: 420,
                hide_on_close: true,
            });
            dialog.connect('close-request', () => {
                if (prefsWindow._hypergnomeActiveKeyDialog === dialog)
                    prefsWindow._hypergnomeActiveKeyDialog = null;
            });
            dialog.set_content(content);
            attachKeyCapture(dialog);
            prefsWindow._hypergnomeActiveKeyDialog = dialog;
            refreshList();
            dialog.present();
        }

        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            content.grab_focus();
            return GLib.SOURCE_REMOVE;
        });
    }

    _refreshDynamicConflictsGroup(group, conflictRows, settings, staticOverrides) {
        for (const row of conflictRows) {
            try {
                group.remove(row);
            } catch (_e) {
                // Row already removed
            }
        }
        conflictRows.length = 0;

        const dynamicConflicts = this._detectDynamicConflicts(
            settings, staticOverrides);
        group.visible = dynamicConflicts.length > 0;

        for (const conflict of dynamicConflicts) {
            const row = new Adw.ActionRow({
                title: `${this._humanizeBindingName(conflict.gnomeName)}`,
                subtitle: `Conflicts with ${conflict.ourLabel}`,
                icon_name: 'dialog-warning-symbolic',
            });

            const label = new Gtk.ShortcutLabel({
                accelerator: conflict.accelerator,
                valign: Gtk.Align.CENTER,
            });
            row.add_suffix(label);
            group.add(row);
            conflictRows.push(row);
        }
    }

    _isModifierKey(keyval) {
        return [
            Gdk.KEY_Shift_L, Gdk.KEY_Shift_R,
            Gdk.KEY_Control_L, Gdk.KEY_Control_R,
            Gdk.KEY_Alt_L, Gdk.KEY_Alt_R,
            Gdk.KEY_Super_L, Gdk.KEY_Super_R,
            Gdk.KEY_Meta_L, Gdk.KEY_Meta_R,
            Gdk.KEY_Caps_Lock, Gdk.KEY_Num_Lock,
        ].includes(keyval);
    }

    // =========================================================================
    // Conflict detection helpers
    // =========================================================================

    /**
     * Read accelerators for a system keybinding.
     */
    _getSystemAccelerators(schemaId, key) {
        try {
            const s = new Gio.Settings({schema_id: schemaId});
            return s.get_strv(key).filter(a => a && a !== '');
        } catch (_e) {
            return [];
        }
    }

    /**
     * Scan system keybinding schemas for conflicts with our bindings,
     * excluding the ones we statically override.
     */
    _detectDynamicConflicts(settings, staticOverrides) {
        const staticNames = new Set(staticOverrides.map(o => o.gnomeName));
        const conflicts = [];

        // Build a map of all our accelerators -> binding label
        const ourAccels = new Map();
        const bindingKeys = settings.list_keys().filter(k => k.startsWith('tile-'));
        for (const key of bindingKeys) {
            const accels = settings.get_strv(key);
            for (const accel of accels) {
                if (accel)
                    ourAccels.set(accel.toLowerCase(), this._humanizeBindingName(key));
            }
        }

        // Check system schemas
        const schemas = [
            'org.gnome.desktop.wm.keybindings',
            'org.gnome.mutter.keybindings',
            'org.gnome.shell.keybindings',
        ];

        for (const schemaId of schemas) {
            try {
                const s = new Gio.Settings({schema_id: schemaId});
                for (const key of s.list_keys()) {
                    if (staticNames.has(key))
                        continue;

                    let accels;
                    try {
                        accels = s.get_strv(key);
                    } catch (_e2) {
                        continue; // Not a string array key
                    }

                    for (const accel of accels) {
                        if (!accel)
                            continue;
                        const ourLabel = ourAccels.get(accel.toLowerCase());
                        if (ourLabel) {
                            conflicts.push({
                                gnomeName: key,
                                gnomeSchema: schemaId,
                                accelerator: accel,
                                ourLabel,
                            });
                        }
                    }
                }
            } catch (_e) {
                // Schema not available on this system
            }
        }

        return conflicts;
    }

    /**
     * Convert a GSettings key name to a human-readable label.
     */
    _humanizeBindingName(name) {
        return name
            .replace(/^tile-/, '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }
}
