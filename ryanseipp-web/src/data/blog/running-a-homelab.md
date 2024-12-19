---
title: Running a homelab for fun and profit
author: Ryan Seipp
pubDate: 2024-12-19
description: How I'm getting started with a homelab and what I hope to learn.
categories: ["homelab", "nixos", "kubernetes", "security"]
---

A few years ago I ran a homelab on decommissioned enterprise servers. They were
loud, hot, and slow, but I had the luxury of hiding them away in a closet. Since
then, I've moved several times, and I don't have that luxury any more. Listening
to those servers 24/7 would drive me into insanity, so they've been sitting in
storage ever since.

The desire to learn and play with technology hasn't gone away. I learned a lot
when I was using those servers, and I am now at a point where I could use a lot
of learning, and a playground to test things without fear of failure.

## A Next Generation Homelab

A new trend has taken the internet by storm, where instead of big metal
decommissioned enterprise gear, you fill your homelab with mini PCs. They're
much smaller, quieter, and more power efficient. Compared to servers from 5+
years ago, the mini PCs are faster too. Of course, you still need to be careful
with hardware selection. Many will have limited expansion, no extra PCIe slot,
limited networking, or insufficient cooling for 24/7 use.

There is a Goldilocks zone in mini PCs, depending on the use-case. For me, that
was the Minisforum MS-01. It has space for extra storage or memory, a PCIe x8
slot, and plenty of connectivity options with dual 2.5GbE, 10G SFP+, and
Thunderbolt 4 ports. There are still compromises, like no IPMI, support for ECC
memory, or limited PCIe bandwidth to the extra M.2 NVMe slots. However, this
will be more than adequate for me.

## The Plan

Coming into this journey, I have a few goals that I want to accomplish.

The primary goal is to run a bare-metal Kubernetes cluster. I want to learn the
internals, so I won't be using a K8s distribution like
[k0s](https://k0sproject.io/), [k3s](https://k3s.io/) or
[RKE2](https://docs.rke2.io/). I want to run this bare-metal rather than
virtualized because it actually simplifies things for me. I want to run every
service containerized anyways, and virtualized K8s is just bare-metal K8s with
more things in the middle.

The entire setup should be declarative and automated. Homelabs break hard and
fast, and that's the whole point. I may not need to worry about downtime since
the only user is me, but if I need to spend a weekend running commands in a CLI
to recover from a mistake, it's going to make me move slower and limit how much
I want to experiment. This declarative configuration should cover the entire
host, as well as services in K8s. For that reason, I'll be using NixOS and
ArgoCD for the host and Kubernetes respectively.

The setup should be (mostly) production-grade. I want the things I learn to be
relevant in my career, so I need to approach problems in a similar way to how I
would for work. This means the homelab should be as secure as possible, and have
strategies in place for disaster recovery. Part of this disaster recovery
approach is handled by the previous goal. I will likely omit this goal in
certain scenarios where the solution is cost-prohibitive, or impractical with my
homelab's scale.

## Next Steps

I'll be starting out with just a single MS-01 and my ISP's modem/router. This
will let me prove some ideas before spending a ton of money or complicating the
setup with multiple devices. Eventually, this will expand into more machines
with proper networking equipment.

The first thing to tackle is the NixOS configuration, securing the base OS, and
ensuring I can access the machine without a monitor and keyboard attached. When
that is done, I can move on to setting up Kubernetes.

## Conclusion

There's a lot to be learned by running a homelab. My goals may be entirely
different from yours, but don't let that stop you from just getting started. The
cost of hardware can pay for itself in raises or promotions if your career is
tech-related. Or, playing with bleeding edge technology can just be a fun thing
to do.

I'll be documenting everything along the way, with what worked and what didn't.
If you'd like to follow along, [subscribe to the RSS feed](/rss.xml), or click
on one of the tags to view all the related posts.
