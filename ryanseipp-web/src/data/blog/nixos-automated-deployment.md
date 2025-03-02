---
title: (Almost) Unattended NixOS Installs
author: Ryan Seipp
pubDate: 2024-12-23
description: Automating NixOS installs, and learning from mistakes.
categories: ["homelab", "nixos", "security"]
---

This post builds on configuration in
[Secure Boot on NixOS](/post/nixos-secure-boot).

Yesterday I was tinkering setting up users and SSH access, preparing for another
blog post. I made the changes, deployed the changes onto the MS-01, tried to SSH
in, and... no luck. I decided to debug on the machine itself to poke around, so
I hooked up the monitor and keyboard, typed in my login... didn't work. Long
story short I completely locked myself out of the system, and I had no way of
getting back in.

I decided I needed to reinstall the system so I could fix my configuration error
and regain access to the otherwise empty system. What a pain though, what if we
could automate the install process completely so that all we need to do is boot
into the installation USB and run a command from our host system to install the
remote device entirely?

I learned this isn't entirely possible _yet_, but we can get 90% there.

## Installing Over SSH

[nixos-anywhere](https://github.com/nix-community/nixos-anywhere) is a tool that
scripts out the NixOS install process, and allows us to be a bit more
declarative about our system. It leverages the fact that the minimal
installation ISO starts up an SSH server, so theoretically all that we need to
do is boot the installer, set a password, and run our command!

Disk partitioning is handled by a tool called
[disko](https://github.com/nix-community/disko), and allows us to declare which
partitions we want on which disks, and with which filesystems. Thankfully, it
also supports OpenZFS, which we need for our impermanence setup. Let's create a
module for that configuration at `nix/modules/server/partitions.nix`.

```nix
{
  lib,
  config,
  ...
}: let
  cfg = config.rs-homelab;
in {
  options = {
    rs-homelab.bootDrive = lib.mkOption {
      type = lib.types.str;
      default = "nvme1n1";
      example = "by-id/nvme-KINGSTON_OM3PGP41024P-A0_50026B7283642E53";
      description = "The boot drive of the system. It's best to use a disk ID as PCIe names can change.";
    };
  };

  config = {
    disko.devices = {
      disk = {
        main = {
          type = "disk";
          device = "/dev/disk/" + cfg.bootDrive;
          content = {
            type = "gpt";
            partitions = {
              ESP = {
                size = "1G";
                type = "EF00";
                content = {
                  type = "filesystem";
                  format = "vfat";
                  mountpoint = "/boot";
                  mountOptions = ["umask=0077"];
                };
              };
              root = {
                size = "100%";
                type = "8300";
                content = {
                  type = "luks";
                  name = "luks-rpool";
                  initrdUnlock = true;
                  passwordFile = "/tmp/disk-encryption.key";
                  content = {
                    type = "zfs";
                    pool = "rpool";
                  };
                  settings = {
                    allowDiscards = true;
                    crypttabExtraOpts = ["tpm2-device=auto" "tpm2-measure-pcr=yes"];
                  };
                };
              };
            };
          };
        };
      };

      zpool = {
        rpool = {
          type = "zpool";
          options = {
            ashift = "12";
            autotrim = "on";
          };
          rootFsOptions = {
            acltype = "posixacl";
            canmount = "off";
            dnodesize = "auto";
            normalization = "formD";
            relatime = "on";
            xattr = "sa";
            mountpoint = "none";
          };
          postCreateHook = "zfs list -t snapshot -H -o name | grep -E '^rpool/local/root@blank$' || zfs snapshot rpool/local/root@blank";

          datasets = {
            local = {
              type = "zfs_fs";
              options.mountpoint = "none";
            };
            safe = {
              type = "zfs_fs";
              options.mountpoint = "none";
              options."com.sun:auto-snapshot" = "true";
            };
            "local/root" = {
              type = "zfs_fs";
              mountpoint = "/";
            };
            "local/nix" = {
              type = "zfs_fs";
              mountpoint = "/nix";
            };
            "safe/persist" = {
              type = "zfs_fs";
              mountpoint = "/persist";
            };
            "safe/home" = {
              type = "zfs_fs";
              mountpoint = "/home";
            };
          };
        };
      };
    };

    fileSystems."/persist".neededForBoot = true;
  };
}
```

There's a bit going on here, but it's effectively the manual partitioning steps
we took in [Encrypted Root and ZFS on NixOS](/post/nixos-encrypted-root). In
`disko.devices.disk.main.device`, we set the device we're using for boot. This
is configurable as it won't be the same for every host. We should prefer setting
`/dev/disk/by-id` values here as `/dev/nvme1n1` and the like can change
depending on which order the disks attach to the PCIe bus on boot.

We configure the UEFI System Partition (ESP) and root partitions, setting up
LUKS on the latter. The contents of the LUKS device becomes the ZFS pool
`rpool`, which we setup further down.

For the ZFS setup, this too is very similar to what we had before, but we're
getting rid of the legacy mountpoints for each dataset, and mounting the
datasets directly to the filesystem. I'm not enough of a wizard to know what
difference this makes, but "legacy" makes me want to avoid it. disko also allows
us to set a `postCreateHook` which lets us create the snapshot we'll need for
impermanence.

Finally, we set `neededForBoot` on the `/persist` filesystem created by disko.
This is needed for impermanence, but disko doesn't have a direct option for it.

Now we can wire up this module. In `nix/modules/server/default.nix`, we just
need to import the module.

```nix
# ...
  imports = [
    ./partitions.nix
    # ...
  ];
# ...
```

Now, we can set the `rs-homelab.bootDrive` option in
`nix/hosts/kube-nix-1/default.nix`. You can get the value for this from your
existing NixOS install with `ls -l /dev/disk/by-id`. This is unfortunately one
area where the install isn't entirely unattended. When we're installing on a
machine for the first time, we'd need to find the disk and update our
configuration before installing it.

```nix
  # ...
  rs-homelab = {
    bootDrive = "by-id/nvme-KINGSTON_OM3PGP41024P-A0_50026B7283642E53";
    # ...
  };
  # ...
```

## Preparing Secrets

There are two secrets we'll need nixos-anywhere to place on the machine for us.
The first is the disk encryption password. You may have noticed in the disko
config that we set the following.

```nix
disko.devices.disk.main.content.partitions.root.content.passwordFile = "/tmp/disk-encryption.key";
```

This allows us to automatically set the disk encryption password using a file
that's placed on the installer before the install happens. Let's create the file
that nixos-anywhere will copy over.

```sh
export MY_PASS=$(mktemp)
nvim $MY_PASS
```

Type the password you want to use for disk encryption in that file, save, and
exit.

The next secret we'll need is the secure boot signing key. Lanzaboote doesn't
currently allow us to create the signing key if it's missing during the install.
This functionality may be added in the future, at which point we'd be able to
eliminate this step. Let's create the signing key on our host machine. `sbctl`
is pretty adamant that it creates the keys in `/var/lib/sbctl`, so we'll need to
take some steps if you already have signing keys for Secure Boot on your device.

```sh
# if /var/lib/sbctl already exists
sudo mv /var/lib/sbctl /var/lib/sbctl.bak

sudo sbctl create-keys
export MY_KEYS=$(mktemp -d)
mkdir -p "${MY_KEYS}/persist/var/lib"
sudo mv /var/lib/sbctl "${MY_KEYS}/persist/var/lib/sbctl"
sudo chown -R "$(id -u):$(id -g)" $MY_KEYS
cp -r "${MY_KEYS}/persist/var" $MY_KEYS

# if you made a backup of sbctl before
sudo mv /var/lib/sbctl.bak /var/lib/sbctl
```

We had to create the entire filesystem structure in the temp directory because
nixos-anywhere only supports copying files recursively from `/`. Additionally,
we had to copy the keys into both `/persist/var` and `/var` because impermanence
won't have activated symlinks during the install, but lanzaboote still needs
them.

## Ensuring Access After Installation

There's a few pieces missing in our configuration if we're going to keep access
after the install completes. Impermanence is enabled, so everything will be
wiped on the first boot after the installation completes. This means
`/etc/passwd` and the like will be removed, along with any SSH allowed keys.

Let's start by declaring users for all of our machines. Create a module at
`nix/modules/server/users.nix`.

```nix
{
  lib,
  config,
  pkgs,
  ...
}: let
  cfg = config.rs-homelab.server.defaultUsers;
in {
  options = {
    rs-homelab.server.defaultUsers.enable = lib.mkEnableOption "setup default users";
  };

  config = lib.mkIf cfg.enable {
    nix.settings.trusted-users = ["@wheel"];
    programs.zsh.enable = true;
    users.defaultUserShell = pkgs.zsh;

    users.mutableUsers = false;

    users.users.root = {
      hashedPassword = "$y$jFT$Zr8lYLcUSYc0WjmE4RqMm/$NOpV5GEcf0/JuJ4d8ZD2XgvP4y0fQHkBC1o3JtAndJ7";
      openssh.authorizedKeys.keyFiles = [
        ./keys/id_ed25519.pub
        ./keys/id_rsa.pub
      ];
    };

    users.users.myuser = {
      isNormalUser = true;
      extraGroups = ["wheel"];
      hashedPassword = "$y$jFT$tLii9mPfURGpMC/XIf6901$7Vb.uOqNcHMqcIZD1LRBRoYkeT.lzw6EKoTGuITZAI7";
      openssh.authorizedKeys.keyFiles = [
        ./keys/id_ed25519.pub
        ./keys/id_rsa.pub
      ];
    };
  };
}
```

Here, we're allowing users in the `wheel` group to update the system
configuration, setting ZSH as the default shell, and declaring our users. We're
setting `users.mutableUsers = false;`, which means users can only be modified
(including their passwords) via the configuration file here. It also means
`/etc/passwd` and `/etc/shadow` are symlinked from `/nix/store`, so our
passwords are kept after a reboot.

Speaking of passwords, we're setting the password hash for each user. You can
create a password by running

```sh
mkpasswd -m yescrypt
```

I've also placed public keys I want to authenticate myself with in
`nix/modules/server/keys`, and reference them here for each user so I can SSH in
later without a password.

Let's enable this by default for all servers in
`nix/modules/server/default.nix`.

```nix
  # ...
  imports = [
    # ...
    ./users.nix
  ];
  # ...
  config = lib.mkIf cfg.enable {
    rs-homelab.server.defaultUsers.enable = lib.mkDefault true;
    # ...
  };
```

## Reinstalling Again

Okay, now we're at the point where we can install the system again. Start by
booting the machine and setting Secure Boot into
[setup mode](https://github.com/nix-community/lanzaboote/blob/master/docs/QUICK_START.md#entering-secure-boot-setup-mode).
Then boot into the installation USB.

When the system starts, run `passwd` to set a password for the `nixos` user.
Also, determine the boot disk if you need to with `ls -l /dev/disk/by-id`.
Finally, figure out which IP the machine got from DCHP with `ip a`.

Now we can run the installation.

```sh
nix run github:nix-community/nixos-anywhere -- \
  --flake '.#kube-host-1' \
  --extra-files $MY_KEYS \
  --disk-encryption-keys /tmp/disk-encryption.key $MY_PASS \
  --generate-hardware-config nixos-generate-config ./nix/hosts/kube-host-1/hardware-configuration.nix \
  --target-host nixos@192.168.0.12
```

nixos-anywhere should kick into gear. You'll be prompted to enter the SSH
password you set on the machine, then it'll wipe any existing partitions, create
the new ones, create any filesystems (including ZFS pools/datasets), generate
the hardware config, copy the hardware config back onto your machine, build and
copy the configuration over to the new machine, install lanzaboote, and restart.

If you encounter any errors with the configuration or something else, it's fine
to rerun the command after fixing the error. Just note that doing so will erase
all data on the drives.

## Finishing Secure Boot & TPM unlock

Like I mentioned at the start of this post, the install isn't entirely
unattended. Lanzaboote doesn't enroll the keys in the UEFI, so when the machine
reboots, it's still in Secure Boot setup mode (you can check with
`bootctl status`). Additionally, we haven't enrolled the disk encryption unlock
with the TPM since we won't have the correct parameters.

To fix all of this, login as root on the machine and run the following.

```sh
sbctl enroll-keys --microsoft
reboot
```

Then login as root again and run

```sh
# verify the machine is no longer in Secure Boot setup mode
bootctl status

# find the disk with the LUKS device
lsblk

# enroll the device with the TPM (change this)
cryptenroll /dev/nvme0n1p2
```

Now, when the machine is rebooted again, the TPM should unlock the encrypted
disk and drop you right into the login.

## Conclusion

System installation has come a long way. We can automate more now than ever, and
if we weren't so focused on security, this would be an entirely automated
process. Hopefully lanzaboote adds the hooks to make Secure Boot setup fully
automated in the future.

On the bright side, we've ensured that all of our machines will have a
consistent partitioning scheme, and that it's easy to reinstall a machine if we
lock ourselves out.

This post is one of many about running a homelab. To view more, click on a tag
at the top of the page to see more related posts.
