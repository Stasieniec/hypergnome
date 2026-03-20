#!/usr/bin/env bash
# Create a QEMU/KVM VM for testing HyperGnome on a specific GNOME version.
#
# Usage: ./test-vm/create-vm.sh <vm-name> <iso-path> [ram-mb] [disk-gb]
# Example: ./test-vm/create-vm.sh gnome49 test-vm/iso/Fedora-43.iso

set -euo pipefail

VM_NAME="${1:?Usage: $0 <vm-name> <iso-path> [ram-mb] [disk-gb]}"
ISO_PATH="${2:?Usage: $0 <vm-name> <iso-path> [ram-mb] [disk-gb]}"
RAM_MB="${3:-4096}"
DISK_GB="${4:-20}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DISK_DIR="${SCRIPT_DIR}/disks"

if ! command -v virt-install &>/dev/null; then
    echo "Error: virt-install not found. Install with:"
    echo "  sudo apt install qemu-system-x86_64 qemu-utils libvirt-daemon-system virt-manager ovmf"
    exit 1
fi

if [ ! -f "$ISO_PATH" ]; then
    echo "Error: ISO not found at $ISO_PATH"
    exit 1
fi

mkdir -p "$DISK_DIR"
DISK_PATH="${DISK_DIR}/${VM_NAME}.qcow2"

if virsh dominfo "$VM_NAME" &>/dev/null; then
    echo "VM '$VM_NAME' already exists. Delete it first with:"
    echo "  virsh destroy $VM_NAME; virsh undefine $VM_NAME --remove-all-storage"
    exit 1
fi

echo "Creating VM: $VM_NAME"
echo "  ISO:  $ISO_PATH"
echo "  RAM:  ${RAM_MB}MB"
echo "  Disk: ${DISK_GB}GB at $DISK_PATH"
echo ""

# Detect OS variant for virt-install
OS_VARIANT="generic"
case "$VM_NAME" in
    *ubuntu24*|*gnome46*) OS_VARIANT="ubuntu24.04" ;;
    *fedora41*|*gnome47*) OS_VARIANT="fedora-unknown" ;;
    *fedora42*|*gnome48*) OS_VARIANT="fedora-unknown" ;;
    *fedora43*|*gnome49*) OS_VARIANT="fedora-unknown" ;;
esac

virt-install \
    --name "$VM_NAME" \
    --ram "$RAM_MB" \
    --vcpus 2 \
    --os-variant "$OS_VARIANT" \
    --disk "path=${DISK_PATH},size=${DISK_GB},format=qcow2" \
    --cdrom "$ISO_PATH" \
    --network default \
    --graphics spice \
    --video virtio \
    --boot uefi \
    --noautoconsole

echo ""
echo "VM '$VM_NAME' created and booting."
echo ""
echo "Next steps:"
echo "  1. Open virt-manager to complete the OS installation"
echo "  2. Inside the VM, install SSH server:"
echo "     Fedora: sudo dnf install openssh-server && sudo systemctl enable --now sshd"
echo "     Ubuntu: sudo apt install openssh-server"
echo "  3. Run: ./test-vm/test-extension.sh $VM_NAME"
