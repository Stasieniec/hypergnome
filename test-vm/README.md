# HyperGnome VM Testing Environment

Test the extension across GNOME 46, 47, 48, and 49 using QEMU/KVM VMs.

## Prerequisites

Install QEMU and virt-manager:

```bash
sudo apt install qemu-system-x86_64 qemu-utils libvirt-daemon-system \
  virt-manager ovmf swtpm
sudo usermod -aG libvirt $USER
# Log out and back in for group change to take effect
```

## ISO Downloads

Download ISOs for each GNOME version you want to test:

| GNOME | Distro | Download |
|-------|--------|----------|
| 46 | Ubuntu 24.04.2 LTS | https://releases.ubuntu.com/24.04/ |
| 47 | Fedora 41 Workstation | https://fedoraproject.org/workstation/download |
| 48 | Fedora 42 Workstation | https://fedoraproject.org/workstation/download |
| 49 | Fedora 43 Workstation | https://fedoraproject.org/workstation/download |

Place ISOs in `test-vm/iso/`.

## Quick Start

```bash
# Create and boot a VM (first time — installs from ISO)
./test-vm/create-vm.sh gnome49 test-vm/iso/Fedora-43.iso

# After OS is installed, use the test script to deploy + test:
./test-vm/test-extension.sh gnome49
```

## How It Works

1. `create-vm.sh` creates a QEMU/KVM VM with the given ISO
2. After you install the OS in the VM, `test-extension.sh`:
   - Builds the extension zip
   - Copies it into the VM via SSH
   - Installs and enables it
   - Tails the journal for errors

## VM Management

```bash
# List VMs
virsh list --all

# Start a VM
virsh start gnome49

# Connect to VM console (use virt-manager for graphical)
virt-manager

# SSH into VM (after setting up SSH in the guest)
ssh -p 2222 user@localhost  # port forwarded by create-vm.sh

# Shutdown
virsh shutdown gnome49

# Delete a VM completely
virsh destroy gnome49; virsh undefine gnome49 --remove-all-storage
```

## Alternative: Nested GNOME Shell (local, no VM)

For GNOME 46-48, you can test without a VM using a nested session:

```bash
dbus-run-session -- gnome-shell --nested --wayland
```

**Note:** GNOME 49+ removed `--nested`. Use `--devkit` instead:

```bash
dbus-run-session -- gnome-shell --devkit --wayland
```

## Alternative: GNOME OS Nightly

GNOME OS provides nightly VM images for testing the latest GNOME:
https://os.gnome.org/

Download the image and import it into GNOME Boxes or virt-manager.
