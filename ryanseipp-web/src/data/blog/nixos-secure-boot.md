---
title: Secure Boot on NixOS
author: Ryan Seipp
pubDate: 2024-12-22
description: Attesting physical security of NixOS with Secure Boot and TPM2.
categories: ["homelab", "nixos", "security"]
---

This post builds on configuration in
[Encrypted Root and ZFS on NixOS](/post/nixos-encrypted-root).

Physical security of devices is important to protect the integrity of data and
prevent it from falling into the wrong hands. In the last post, we greatly
improved physical security by encrypting data at rest on drives. It wasn't
without negatives though, as we now need to provide a password every time the
machine boots, making it challenging to be physically distant from the machine,
or annoying to hook up a keyboard and monitor every time a reboot is necessary.

This isn't something we'll need to live with long. Microsoft released
[Secure Boot](https://en.wikipedia.org/wiki/UEFI#Secure_Boot) in 2011, and it's
now present on effectively every machine. The technology has its
[criticisms](https://en.wikipedia.org/wiki/UEFI#Secure_Boot_criticism), but in
this scenario, we can leverage it to our advantage.

Secure Boot requires that the bootloader is signed by a trusted key, and we are
able to install our own key into the UEFI. This effectively helps us know that
the machine is always booting into a Linux kernel we've installed. Adding to
this is the
[Trusted Platform Module](https://en.wikipedia.org/wiki/Trusted_Platform_Module)
(TPM) which stores measurements collected about the system, as well as
cryptographic keys or other secrets.

Combining Secure Boot and TPM2, we're able to effectively attest that the system
has booted with a UEFI, bootloader, kernel parameters, and more, that we trust.
If that attestation is successful, the TPM can release a secret to the system
that can be used to automatically unlock our encrypted root partition.

## Creating Secure Boot Keys

To create the secure boot signing key, ssh into the remote machine and run
`sbctl`. We don't have this tool installed yet, but we can run it in a Nix
shell.

```sh
nix-shell -p sbctl
sbctl create-keys
```

This will place the keys in either `/etc/secureboot` or `/var/lib/sbctl`
depending on the version of sbctl you have. Make a note of this, as we'll need
to configure impermanence to keep the directory around.

## Setup Lanzaboote

Lanzaboote is the tool that enables Secure Boot for NixOS installs. To get
started, let's take a dependency on it in our `flake.nix`.

```nix
  inputs = {
    # ...

    # secure-boot
    lanzaboote = {
      url = "github:nix-community/lanzaboote/v0.4.1";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.flake-utils.follows = "flake-utils";
    };
  };

  # ...

      nixosConfigurations = {
        kube-host-1 = lib.nixosSystem {
          system = "x86_64-linux";
          modules = [
            lanzaboote.nixosModules.lanzaboote
            impermanence.nixosModules.impermanence
            ./nix/hosts/kube-host-1
          ];
          specialArgs = {inherit inputs outputs;};
        };
      };
```

Secure Boot will require some configuration and a few tools on the remote
machine, so let's create a new module. We'll start by updating
`nix/modules/server/default.nix`.

```nix
{
  # ...
}: {
  imports = [
    ./secure-boot.nix
    ./zfs.nix
  ];

  # ...

  config = lib.mkIf cfg.enable {
    rs-homelab.server.secure-boot.enable = lib.mkDefault true;
    rs-homelab.server.zfs.enable = lib.mkDefault true;
  };
}
```

Here we're just importing the module we're about to create, and enabling
secure-boot configuration by default. If you've been following along, this will
get enabled automatically. Otherwise, be sure to set
`rs-homelab.server.enable = true;`. Let's add the module now at
`nix/modules/server/secure-boot.nix`.

```nix
{
  lib,
  config,
  pkgs,
  ...
}: let
  cfg = config.rs-homelab.server.secure-boot;
in {
  options = {
    rs-homelab.server.secure-boot.enable = lib.mkEnableOption "Enables secure boot";
  };

  config = lib.mkIf cfg.enable {
    boot.lanzaboote = {
      enable = true;
      pkiBundle = "/var/lib/sbctl"; # or /etc/secureboot
    };

    # or /etc/secureboot
    environment.persistence."/persist".directories = ["/var/lib/sbctl"];

    # Disable systemd-boot because lanzaboote installs the signed bootloader
    boot.loader.systemd-boot.enable = lib.mkForce false;
    boot.initrd.systemd.enable = true;
    boot.initrd.systemd.tpm2.enable = true;

    security.tpm2 = {
      enable = true;
      pkcs11.enable = true;
      tctiEnvironment.enable = true;
    };

    environment.shellAliases = {
      # Requires a device argument (/dev/nvme1n1p2)
      cryptenroll = "systemd-cryptenroll --tpm2-device=auto --tpm2-pcrs=0+2+7+15:sha256=0000000000000000000000000000000000000000000000000000000000000000 --wipe-slot=tpm2";
    };

    # CLI tools to debug with
    environment.systemPackages = with pkgs; [
      sbctl
      tpm2-tools
    ];
  };
}
```

This adds TPM2 support for the system, as well as to the boot process. It also
installs sbctl on the remote machine, and a shell alias that will come in handy
when we need to re-enroll the TPM due to new measurements. Finally, it enables
lanzaboote, which will automatically pick up the signing key on the remote
machine, sign the bootloader, and install it.

Last but not least, we need to enable TPM measurement support on the LUKS device
itself in `nix/hosts/kube-host-1/hardware-configuration.nix`.

```nix
  boot.initrd.luks.devices = {
    luks-rpool = {
      # ...
      crypttabExtraOpts = ["tpm2-device=auto" "tpm2-measure-pcr=yes"];
    };
  };
```

Now we're ready to apply the configuration onto the remote machine. Before we
move onto enabling Secure Boot, run `sbctl verify` on the remote machine to make
sure the `nixos-generation-*.efi` files are signed, as well as
`systemd-bootx64.efi`.

## Enabling Secure Boot

Check the
[quick start guide](https://github.com/nix-community/lanzaboote/blob/master/docs/QUICK_START.md#part-2-enabling-secure-boot)
in the lanzaboote repository and follow those instructions.

Don't forget to set a password on the BIOS. Secure Boot isn't as helpful if it
can be turned off easily. The TPM will still fail to unlock the encrypted
partition automatically if this occurs.

On the MS-01, you will also need to go into the "Security" > "Key Management"
menu and disable "Factory Key Provision". Make sure to save changes when
resetting, as there is a pop-up menu that asks to reset _without_ saving
changes.

## Auto-Unlock the LUKS Partition

Now that secure boot is enabled, TPM measurements should be stable and we can
lock them in by enrolling the LUKS-encrypted partition to automatically decrypt.
On the remote machine, run:

```sh
# replace sdxN with the encrypted partition (sda2, nvme0n1p2, etc.)
cryptenroll /dev/sdxN
```

Enter the password you use to decrypt the partition at boot. With the device
enrolled, we can try it out by rebooting. If you need to enter your password,
try enrolling the device again.

## Conclusion

Our physical security posture is now in a much better position. Should the
machine get stolen, attackers will have a much harder time reading data directly
off the disk, or tampering with the boot process.

This post is one of many about running a homelab. To view more, click on a tag
at the top of the page to see more related posts.
