---
title: Using Nix Flakes to Configure Systems
author: Ryan Seipp
pubDate: 2024-12-20
description: A gentle introduction to NixOS and Flakes.
categories: ["homelab", "nixos"]
---

I've been running [NixOS](https://nixos.org/) as a desktop for half a year. It's
a Linux distribution that's purpose-built for declaratively and reproducibly
managing system configuration. This means I can run one command and my machine
will have all of the configuration I wanted. If I push changes to a git
repository, I can checkout any commit I've made in the past and switch to that
configuration. It'll just work.

I use Nix Flakes for everything from system configuration to little development
shells with tools I need. If this is your first time hearing about Nix or
flakes, I'd recommend poking through the
[NixOS & Flakes Book](https://nixos-and-flakes.thiscute.world). If you're
following along, install Nix on a machine other than one you're using for your
homelab. I recommend the
[Determinate Systems installer](https://determinate.systems/nix-installer/)
which works on Linux, macOS, or WSL.

## Getting Started

Since we're after a declarative configuration for everything, we should be able
to store all of the configuration in a git repository. Start by creating a
directory and running

```sh
mkdir homelab && cd homelab

git init
nix flake init
```

Open up the newly created `flake.nix` and replace the contents with the
following:

```nix
{
  description = "A homelab for testing with Kubernetes";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    # common hardware settings
    hardware.url = "github:nixos/nixos-hardware";
  };

  outputs = {
    self,
    nixpkgs,
    ...
  } @ inputs: let
    inherit (self) outputs;
    lib = nixpkgs.lib;
  in
  {
    nixosModules.default = import ./nix/modules;

    nixosConfigurations = {
      kube-host-1 = lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
          ./nix/hosts/kube-host-1
        ];
        specialArgs = {inherit inputs outputs;};
      };
    };
  };
}
```

This configuration is a flake that outputs NixOS modules, and a NixOS
configuration for a host called `kube-host-1`. In the inputs section, we're
declaring the following dependencies on other flakes.

- nixpkgs: The flake containing nix package definitions, and the machinery for
  running NixOS installs.
- hardware: This includes common NixOS settings for specific hardware.
- impermanence: We're going to wipe our root filesystem on every boot, so this
  helps us keep important files around.
- lanzaboote: NixOS doesn't support SecureBoot out of the box, but this helps us
  set it up.

Next we'll setup the directory structure.

```
.
├─ flake.nix
└─ nix
   ├─ hosts
   │  └─ kube-host-1
   └─ modules
```

The `nix` directory will contain all of our Nix configuration. `nix/hosts` will
contain host-specific configuration, and `nix/modules` will contain modularized
configuration that can be applied to any host. Under `nix/hosts`, we can create
a directory for configuration specific to our `kube-host-1` host we specified in
`flake.nix`.

We can prep a configuration file for that host by creating
`nix/hosts/kube-host-1/default.nix`. Place the following content inside.

```nix
{
  pkgs,
  inputs,
  outputs,
  ...
}: {
  imports = [
    outputs.nixosModules.default

    # If your homelab machine has an AMD CPU, replace this with `common-cpu-amd`
    inputs.hardware.nixosModules.common-cpu-intel
    inputs.hardware.nixosModules.common-pc-ssd

    ./hardware-configuration.nix
  ];

  networking = {
    hostName = "kube-host-1";
  };

  # don't worry, we'll get rid of this very soon!
  services.openssh.enable = true;
  services.openssh.settings.PermitRootLogin = "yes";

  environment.systemPackages = with pkgs; [
    vim
  ];

  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  system.stateVersion = "24.11";
}
```

You can view more about what each of these settings do via the
[NixOS options search](https://search.nixos.org/options). We're using the
unstable branch of `nixpkgs`, so make sure to select the "unstable" channel.

## Defining Common Configuration

The goal for my homelab is that every machine in it is treated like cattle,
instead of pets. This is a necessity for work environments where you need to
operate hundreds or thousands of servers. Some of those servers may have
different tasks (storage vs K8s system vs K8s worker, etc.), but within those
tasks, every system should be treated the same. While I'll never come remotely
close to that scale in my homelab, I still want to treat it similarly.

It wouldn't make sense for us to copy lots of configuration files for each host.
Making changes across an entire fleet of machines would take much more time, and
inevitably configuration will drift. The result would be snowflakes instead of
cattle. Thankfully, Nix helps us with its module system.

We can create `nix/modules/default.nix` with the following content.

```nix
{
  inputs,
  ...
}: {
  nix = {
    channel.enable = false;
    nixPath = ["nixpkgs=${inputs.nixpkgs}"];
    settings.experimental-features = ["nix-command" "flakes"];

    gc = {
      automatic = true;
      dates = "weekly";
      options = "delete-older-than 7d";
      persistent = false;
    };

    optimise = {
      automatic = true;
      dates = ["weekly"];
    };
  };
}
```

We've just configured NixOS to disable channels, enable flakes, clean up unused
files in `/nix/store`, and optimise storage by reducing redundancy. This
automatically gets applied to every host that imports
`outputs.nixosModules.default` like we did in
`nix/hosts/kube-host-1/default.nix`.

## Installing NixOS

We've stubbed out some configuration, now let's put it to the test. Get a copy
of the [NixOS minimal ISO image](https://nixos.org/download/#nixos-iso). Don't
get too attached to this install, because we will need to reinstall when we want
to encrypt the root partition. That future install will require the minimal
install, so it's best to get used to it for now.

Follow the installation instructions in the
[NixOS Manual](https://nixos.org/manual/nixos/stable/#sec-installation-manual).
When you get to the step where you edit the `configuration.nix` file, add the
following lines so we can access this install via OpenSSH later.

```nix
  services.openssh.enable = true;
  services.openssh.settings.PermitRootLogin = "yes";
```

## Testing the Flake

Now that we have a functioning NixOS machine, let's try installing the
configuration from our flake. Get the IP of the machine via `ip a`, then ssh
into it via `ssh root@$IP`. If that succeeded, exit the SSH session.

We need one file off of the NixOS machine to complete our configuration. That's
the file at `/etc/nixos/hardware-configuration.nix`. To copy it off, we can use
SCP.

```sh
scp root@$IP:/etc/nixos/hardware-configuration.nix ./path/to/homelab/nix/hosts/kube-host-1/hardware-configuration.nix
```

Using `nixos-rebuild switch`, you normally update the local machine's
configuration. However, we want to take a configuration that we have locally,
and apply it to a remote machine. Thankfully, `nixos-rebuild` allows us to do
that.

```sh
nixos-rebuild --flake .#kube-host-1 --target-host root@$IP switch
```

If the command exited successfully, we can verify that by connecting into the
machine again via SSH.

```sh
ssh root@$IP
systemctl -t timer
```

If you see systemd timers for `nix-gc.timer` and `nix-optimise.timer`, then we
know that the configuration is applied successfully, and that NixOS will
automatically keep the `/nix/store` healthy.

## Conclusion

We're just scratching the surface here, and our security posture isn't great.
We'll fix all of that soon enough, but for now we have a good foundation to
build declarative system configuration.

This post is one of many about running a homelab. To view more, click on a tag
at the top of the page to see more related posts.
