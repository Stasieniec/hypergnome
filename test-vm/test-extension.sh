#!/usr/bin/env bash
# Deploy and test HyperGnome extension in a VM.
#
# Usage: ./test-vm/test-extension.sh <vm-name> [ssh-user@host]
# Example: ./test-vm/test-extension.sh gnome49 user@192.168.122.100
#
# The script:
# 1. Builds a fresh extension zip
# 2. Copies it to the VM via SSH
# 3. Installs and enables the extension
# 4. Tails the journal for errors

set -euo pipefail

VM_NAME="${1:?Usage: $0 <vm-name> [ssh-user@host]}"
SSH_TARGET="${2:-}"

UUID="hypergnome@hypergnome.dev"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="${PROJECT_DIR}/dist"

# Build fresh zip
echo "==> Building extension zip..."
make -C "$PROJECT_DIR" dist

ZIP_PATH="${DIST_DIR}/${UUID}.zip"
if [ ! -f "$ZIP_PATH" ]; then
    echo "Error: zip not found at $ZIP_PATH"
    exit 1
fi

# Resolve SSH target from VM name if not provided
if [ -z "$SSH_TARGET" ]; then
    echo "==> Looking up VM IP for '$VM_NAME'..."

    # Try to get IP from libvirt
    VM_IP=$(virsh domifaddr "$VM_NAME" 2>/dev/null | grep -oP '(\d+\.){3}\d+' | head -1 || true)

    if [ -z "$VM_IP" ]; then
        echo "Could not determine VM IP automatically."
        echo "Make sure the VM is running and has an IP."
        echo ""
        echo "You can specify SSH target manually:"
        echo "  $0 $VM_NAME user@<vm-ip>"
        echo ""
        echo "Or find the IP with: virsh domifaddr $VM_NAME"
        exit 1
    fi

    SSH_TARGET="$(whoami)@${VM_IP}"
    echo "   Found: $SSH_TARGET"
fi

echo "==> Copying extension to VM..."
scp -o StrictHostKeyChecking=no "$ZIP_PATH" "${SSH_TARGET}:/tmp/${UUID}.zip"

echo "==> Installing extension in VM..."
ssh -o StrictHostKeyChecking=no "$SSH_TARGET" bash -s <<REMOTE_SCRIPT
set -e

# Check GNOME Shell version
echo "GNOME Shell version: \$(gnome-shell --version)"

# Install extension
gnome-extensions install --force "/tmp/${UUID}.zip"

# Enable extension (may need a shell restart first on Wayland)
gnome-extensions enable "$UUID" 2>/dev/null || true

echo ""
echo "Extension installed. You may need to log out/in for changes to take effect."
echo "After logging back in, run: gnome-extensions enable $UUID"
REMOTE_SCRIPT

echo ""
echo "==> Tailing journal for HyperGnome errors..."
echo "    (Press Ctrl+C to stop)"
echo ""
ssh -o StrictHostKeyChecking=no "$SSH_TARGET" \
    journalctl -f -o cat /usr/bin/gnome-shell 2>/dev/null \
    | grep -i --color=always -E 'hypergnome|error|warning|get_maximized|is_maximized' || true
