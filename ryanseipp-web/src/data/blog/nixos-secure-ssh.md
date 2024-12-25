---
title: Securing SSH on NixOS
author: Ryan Seipp
pubDate: 2024-12-24
description: Locking down SSH so we can sleep well at night.
categories: ["homelab", "nixos", "security"]
---

This post builds on configuration in
[(Almost) Unattended NixOS Installs](./nixos-automated-deployment).

When we first started this journey with NixOS, we setup SSH to be almost
entirely open, allowing root login and password authentication. I said it
wouldn't be long before we fixed that, but we had to take a slight detour first.
Now that we're back on track, it's time to lock down SSH access to make it as
secure as we can.

## Threat Model

SSH listens on a port exposed to the network the machine is attached to. If we
take a zero-trust mindset, then we have to assume that even devices on our local
network are compromised and could be attempting to attack our machine. Attackers
may attempt to brute-force the password, gain root access, or listen to SSH
traffic on the network in an attempt to break the encryption.

Locking down SSH includes denying root access, omitting the use of passwords
entirely, and choosing strong algorithms for key exchange and encryption. We can
also disable certain features of SSH that we won't be using to decrease
attackable surface area of the service.

## Locking it Down

To get started, let's create a new module at `nix/modules/server/ssh.nix`. In
this module we'll enable the `openssh` service to listen on port 22. We'll also
disable root login, password authentication, and choose modern algorithms for
key exchange, encryption, and MAC. Algorithms and extra configuration for SSH is
taken from
[Mozilla recommendations](https://infosec.mozilla.org/guidelines/openssh#modern-openssh-67)
that they use on their own servers.

```nix
{
  lib,
  config,
  ...
}: let
  cfg = config.rs-homelab.server.ssh;
in {
  options = {
    rs-homelab.server.ssh.enable = lib.mkEnableOption "Enables openssh server";
  };

  config = lib.mkIf cfg.enable {
    services.openssh = {
      enable = true;
      allowSFTP = false;
      ports = [22];

      # https://infosec.mozilla.org/guidelines/openssh#modern-openssh-67
      settings = {
        LogLevel = "VERBOSE";
        PermitRootLogin = "no";
        PasswordAuthentication = false;
        KbdInteractiveAuthentication = true;

        KexAlgorithms = [
          "curve25519-sha256@libssh.org"
          "ecdh-sha2-nistp521"
          "ecdh-sha2-nistp384"
          "ecdh-sha2-nistp256"
          "diffie-hellman-group-exchange-sha256"
        ];
        Ciphers = [
          "chacha20-poly1305@openssh.com"
          "aes256-gcm@openssh.com"
          "aes128-gcm@openssh.com"
          "aes256-ctr"
          "aes192-ctr"
          "aes128-ctr"
        ];
        Macs = [
          "hmac-sha2-512-etm@openssh.com"
          "hmac-sha2-256-etm@openssh.com"
          "umac-128-etm@openssh.com"
          "hmac-sha2-512"
          "hmac-sha2-256"
          "umac-128@openssh.com"
        ];
      };

      extraConfig = ''
        ClientAliveCountMax 0
        ClientAliveInterval 300

        AllowTcpForwarding no
        AllowAgentForwarding no
        MaxAuthTries 3
        MaxSessions 2
        TCPKeepAlive no
      '';
    };

    # CLI tools to debug with
    environment.systemPackages = [
      config.services.openssh.package
    ];
  };
}
```

NixOS will, by default, open SSH ports from any address on the firewall. We can
take this a step further by limiting the source IP addresses to those on our
home networks. We can do that by adding the following. Make sure to change the
IPv6 addresses to the prefix delegated by your ISP.

```nix
    services.openssh = {
      # ...
      openFirewall = false;
      # ...
    };

    networking.firewall =
      lib.mkIf (!config.networking.nftables.enable) {
        extraCommands = ''
          iptables -A INPUT -s 10.0.0.0/24 -m state --state NEW -p tcp -dport 22 -j ACCEPT
          ip6tables -A INPUT -s 2001:db8::/64 -m tcp -p tcp -dport 22 -j ACCEPT
        '';
      }
      // lib.mkIf config.networking.nftables.enable {
        extraInputRules = ''
          ip saddr 10.0.0.0/24 tcp dport 22 accept comment "SSH local access"
          ip6 saddr 2001:db8::/64 tcp dport 22 accept comment "SSH local access"
        '';
      };

    # ...
```

If we need to, we can also let NixOS automatically generate SSH host keys for
us, if they don't exist already on the machine. We'll also need impermanence to
keep these around, otherwise clients connecting to the server will receive a
warning that their known_hosts entry doesn't match every time the server
reboots.

```nix
    services.openssh = {
      # ...
      hostKeys = [
        {
          path = "/etc/ssh/ssh_host_ed25519_key";
          type = "ed25519";
        }
        {
          path = "/etc/ssh/ssh_host_rsa_key";
          type = "rsa";
          bits = "4096";
        }
      ];
      # ...
    };

    environment.persistence."/persist".files = [
      "/etc/ssh/ssh_host_ed25519_key"
      "/etc/ssh/ssh_host_ed25519_key.pub"
      "/etc/ssh/ssh_host_rsa_key"
      "/etc/ssh/ssh_host_rsa_key.pub"
    ];

    # ...
```

## Banning Automated Attacks

This last piece is more optional, and involves banning IPs on our firewall if
they fail to login to SSH too many times. This would only take place if you
misconfigure your SSH authorized keys, or if an attacker has compromised another
device in the network, but it primarily helps to quiet the SSH auth logs, and
help delay those attackers from finding other exposed services to compromise
before they can be removed.

To do this, we'll setup Fail2Ban with a very simple configuration.

```nix
    # ...
    services.fail2ban = {
      enable = true;
      maxretry = 10;
      bantime-increment.enable = true;
    };
```

This allows 10 authentication failures (to hopefully prevent a config mistake),
and will automatically increase the ban time should an attacker fail another
attempt before their ban expires.

## Conclusion

We now have a pretty secure SSH configuration. We're using good default
algorithms, blocking root login, enforcing the use of authorized keys, only
allowing traffic from our internal networks, and banning repeat offenders from
accessing the machine. I think we can sleep a lot more soundly at night than
previously.

This post is one of many about running a homelab. To view more, click on a tag
at the top of the page to see more related posts.
