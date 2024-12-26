---
title: Hardening NixOS
author: Ryan Seipp
pubDate: 2024-12-26
description: Tidying up loose ends and benchmarking our security.
categories: ["homelab", "nixos", "security"]
---

This post builds on configuration in
[Securing SSH on NixOS](/post/nixos-secure-ssh).

There's a lot that goes into security. Throughout the course of my homelab, I'll
unfortunately never stop needing to worry about it. We've already covered a lot
about physical security, and ensuring we're booting into and running software we
trust. We just secured remote console access via SSH in the last post. This post
is focused on tuning the kernel to be more secure, and how we can benchmark our
security posture.

Security is a balancing act. So far, I think we've kept a pretty good balance
between security and user experience. For example, we encrypt data at rest
without requiring us to enter a password on every boot. It's also easy to break
stuff if we lock down the system too tightly. We may make it impossible for an
attacker to do something, but we may also prevent ourselves from doing what we
need to, or breaking a service entirely.

## Benchmarking Security

Knowing what to harden is half the battle in security. There's a lot of industry
knowledge and best practices to follow. However, if you're like me, you don't do
security for a living, and don't have the time to learn all the ins and outs. To
help us, we can use security auditing tools to benchmark our security posture.
It'll automatically scan our system, software and settings to find
misconfigurations or other holes we need to fix.

One of these tools is [Lynis](https://cisofy.com/lynis/). It does all of the
above and produces recommendations and a "Hardening index", giving us an easy
way to view how secure we are, and what we can do to improve that. We can
install lynix by adding the following to `nix/modules/server/default.nix`.

```nix
  # ...
  config = lib.mkIf cfg.enable {
    # ...

    environment.systemPackages = with pkgs; [
      lynis
    ];
  };
```

Deploy the configuration, then SSH into the host and run:

```sh
sudo lynis audit system
```

Lynis will then run through a whole bunch of tests. You'll see all of the checks
it's performing, and whether our configuration passes, has suggestions, or
should potentially be fixed. The goal here isn't to get a perfect score, as
doing so would take an enormous amount of effort for diminishing returns. The
goal is to know what our surface area is and to make informed decisions on what
is "secure enough" for our use-case.

## A Note On systemd Services

Lynis performs checks on systemd services by running `systemd-analyze security`.
You are going to see some marked as "UNSAFE". In a lot of cases, you can't
really do much to fix it. systemd is only reporting whether the services have
specific security options set, not whether the service would still function with
those options set.

There is ongoing work in both
[Debian](https://lists.debian.org/debian-devel/2023/07/msg00030.html) and
[Fedora](https://fedoraproject.org/wiki/Changes/SystemdSecurityHardening) (and
potentially others) to work with upstream projects to use systemd hardening
features. Discussion has also been occurring within NixOS on hardening more
systemd services by default, or adding options to enable such a thing. All of
this work will take time, but hopefully the use of hardening features becomes
more standard over time.

## Example configuration to harden the system

I've been iterating on hardening my own system, running an audit, fixing
something, and repeating until I'm satisfied. For now I'm pretty satisfied with
just a few more tweaks.

1. Tune the kernel with sysctls
2. Mount /proc with `hidepid=2`
3. Disable obscure networking protocols
4. Apply a limited set of systemd service hardening
5. Use dbus-broker instead of dbus
6. Limit sudo execution to wheel users

This can all be done with the following configuration.

```nix
{...}: {
  boot.kernel.sysctl = {
    "fs.protected_fifos" = 2;
    "fs.protected_regular" = 2;
    "fs.suid_dumpable" = false;
    "kernel.kptr_restrict" = 2;
    "kernel.sysrq" = false;
    "kernel.unprivileged_bpf_disabled" = true;

    "net.core.bpf_jit_harden" = 2;

    "net.ipv4.conf.all.accept_redirects" = false;
    "net.ipv4.conf.default.accept_redirects" = false;

    "net.ipv6.conf.all.accept_redirects" = false;
    "net.ipv6.conf.default.accept_redirects" = false;

    "net.ipv4.conf.all.log_martians" = true;
    "net.ipv4.conf.default.log_martians" = true;

    "net.ipv4.conf.all.rp_filter" = true;
    "net.ipv4.conf.all.send_redirects" = false;
  };

  fileSystems."/proc" = {
    device = "proc";
    fsType = "proc";
    options = ["defaults" "hidepid=2"];
    # unclear if this is actually needed
    neededForBoot = true;
  };

  boot.blacklistedKernelModules = [
    "dccp"
    "sctp"
    "rds"
    "tipc"
  ];

  services.dbus.implementation = "broker";
  security.sudo.execWheelOnly = true;

  systemd.services.systemd-rfkill = {
    serviceConfig = {
      ProtectSystem = "strict";
      ProtectHome = true;
      ProtectKernelTunables = true;
      ProtectKernelModules = true;
      ProtectControlGroups = true;
      ProtectClock = true;
      ProtectProc = "invisible";
      ProcSubset = "pid";
      PrivateTmp = true;
      MemoryDenyWriteExecute = true;
      NoNewPrivileges = true;
      LockPersonality = true;
      RestrictRealtime = true;
      SystemCallArchitectures = "native";
      UMask = "0077";
      IPAddressDeny = "any";
    };
  };

  systemd.services.systemd-journald = {
    serviceConfig = {
      UMask = 0077;
      PrivateNetwork = true;
      ProtectHostname = true;
      ProtectKernelModules = true;
    };
  };
}
```

This configuration, as well as everything we get by default or did previously,
nets me a lynis audit score of 79. I'm pretty darn happy about that. There's
still more that could be done, such as: adding malware/rootkit scanning,
managing logs, enabling accounting information, etc. There's always more to do,
and I don't have any meaningful way to make that extra information useful to me
yet.

There's also other things that just aren't applicable to our situation. Such as
the checks around password rotation and strength. We're managing our users
declaratively, and as such, we're setting their passwords declaratively too.
It's always a good idea to use strong passwords, such as those generated by a
password manager. I've done that for myself, and it's up to you to setup
processes like that for yourself.

## Conclusion

I'd venture to say our machine is pretty hardened against attackers. It's
certainly more than enough for a homelab machine that's not exposed to the
internet. Treating this as if it were production, I think we're at a reasonable
spot given our scale. None of this is to say we're invulnerable to attackers.
That's never the case, even if it's air-gapped, powered off, and buried in a
mountain.

I've learned a ton about security over the past few days, and I hope you have
too. Stay tuned, because the next interest of mine is getting Kubernetes
deployed on bare-metal.

This post is one of many about running a homelab. To view more, click on a tag
at the top of the page to see more related posts.
