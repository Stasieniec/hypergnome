/**
 * CSS color string parser.
 *
 * Supports rgb(), rgba(), #RGB, #RRGGBB, and #RRGGBBAA formats.
 * Returns normalized {r, g, b, a} with values in 0.0–1.0.
 */

const FALLBACK = {r: 0.15, g: 0.39, b: 0.82, a: 1.0};

/**
 * Parse a CSS color string into normalized RGBA components.
 * @param {string} str - CSS color (e.g. "rgb(255,0,0)", "#ff0000", "#f00")
 * @returns {{r: number, g: number, b: number, a: number}} - Components in 0.0–1.0
 */
export function parseColor(str) {
    if (!str)
        return {...FALLBACK};

    // rgb(r,g,b) or rgba(r,g,b,a)
    const rgbMatch = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/);
    if (rgbMatch) {
        return {
            r: parseInt(rgbMatch[1]) / 255,
            g: parseInt(rgbMatch[2]) / 255,
            b: parseInt(rgbMatch[3]) / 255,
            a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1.0,
        };
    }

    // #RRGGBB, #RRGGBBAA, or #RGB
    const hexMatch = str.match(/^#([0-9a-fA-F]{3,8})$/);
    if (hexMatch) {
        const hex = hexMatch[1];
        if (hex.length === 3) {
            return {
                r: parseInt(hex[0] + hex[0], 16) / 255,
                g: parseInt(hex[1] + hex[1], 16) / 255,
                b: parseInt(hex[2] + hex[2], 16) / 255,
                a: 1.0,
            };
        } else if (hex.length >= 6) {
            return {
                r: parseInt(hex.substring(0, 2), 16) / 255,
                g: parseInt(hex.substring(2, 4), 16) / 255,
                b: parseInt(hex.substring(4, 6), 16) / 255,
                a: hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1.0,
            };
        }
    }

    return {...FALLBACK};
}
