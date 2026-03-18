/**
 * Centralized signal connection tracker.
 *
 * Stores (object, signalId) pairs and disconnects them all on destroy().
 * Replaces the manual `_signals = []` + loop pattern throughout the codebase.
 */

export class SignalManager {
    constructor() {
        this._connections = [];
    }

    /**
     * Connect a signal and track it for later cleanup.
     * @param {GObject.Object} obj - The object to connect to
     * @param {string} signal - Signal name
     * @param {Function} handler - Callback
     * @returns {number} signal id
     */
    connect(obj, signal, handler) {
        const id = obj.connect(signal, handler);
        this._connections.push({obj, id});
        return id;
    }

    /**
     * Disconnect all tracked signals.
     */
    disconnectAll() {
        for (const {obj, id} of this._connections) {
            try {
                obj.disconnect(id);
            } catch (_e) {
                // Object may already be destroyed
            }
        }
        this._connections = [];
    }

    /**
     * Alias for disconnectAll — matches common GNOME extension cleanup pattern.
     */
    destroy() {
        this.disconnectAll();
    }
}
