---
title: An Introduction to Observability
author: Ryan Seipp
pubDate: 2023-12-18
description: "How adding observability to systems helps businesses operate more effectively."
---

## What is observability?

> In distributed systems, observability is the ability to collect data about
> programs' execution, modules' internal states, and the communication among
> components. --
> <cite>[Wikipedia](<https://en.wikipedia.org/wiki/Observability_(software)>)</cite>

In essence, observability is about collecting logs, metrics, and traces from
our systems in order to better understand their operational requirements,
troubleshoot errors, and track business-related performance metrics. This data
represents the living state of the system which, in software-reliant companies,
can often be the living state of the business. It provides crucial information
to prove, or disprove, hypothesis, allowing all aspects of a business to make
more informed decisions.

## How do we make systems observable?

Logs, metrics, and traces are the three components to making systems observable.
Each play a critical role in providing the full picture, and are useful in
unique ways.

#### Logging

Logs are the component most software engineers should be familiar with. They are
most useful for _people_ to read, and should provide clear and concise context
about the system. Did an error occur? If so, provide information useful for the
person intended to resolve the issue. Otherwise, provide context around critical
business logic, or decisions the software must take.

#### Metrics

Metrics add hard data into the mix. Whereas logs are intended for _people_ to
consume, metrics are best consumed by _machines_ to produce visualizations
around the data. Metrics are helpful in answering questions like "How many
orders did we process last month?" or "How long does it take our system to
respond to a request?" As such, this is the place to add business-specific data,
that the marketing or accounting teams can utilize to make decisions. It's also
the place where DevOps or engineers can go to determine how well the system is
performing, or why the system is failing to meet some expected load.

#### Traces

Traces are likely the least familiar component, but potentially the most
revolutionary for collecting information related to time. Traces are a
collection of spans, each of which acquire information around a section of
related code, and how long it took to execute. Spans are hierarchical, and know
their "parent". This allows visualization tools to display the path of code
taken throughout the entire system, even across network or process boundaries.
Adding tracing is the most effective way of collecting fine-grained information
on how long each component took to execute.

## What does the ecosystem look like?

Logging directly into a file may be enough for certain use-cases, but the
ecosystem has developed applications to help derive the full value from each
type of information. These applications have converged on a standard called
[OpenTelemetry](https://opentelemetry.io/) which is a CNCF incubating project.
OpenTelemetry specifies the
[API](https://opentelemetry.io/docs/specs/otel/overview/) for creating traces
and metrics, while [OTLP](https://opentelemetry.io/docs/specs/otlp/) specifies
how that data is transmitted over the network for services to consume.

This standard provides us a common way to describe different aspects of
observability, implement solutions that appear similar in different languages,
and make it simpler to switch vendors without rewriting a large amount of code.

### Instrumentation

OpenTelemetry and the ecosystem around it have developed open source libraries
to automatically instrument applications in a variety of languages.
Documentation can be found [here](https://opentelemetry.io/docs/instrumentation/)
for how to add instrumentation in the languages supported. In later blog posts,
I'll also provide some examples on how to get started in specific languages.

### Exporters

Exporters are the mechanism for getting logs, metrics, and traces out of your
application and into a variety of services. OpenTelemetry operates on a "push"
model to export data. This is in contrast to applications like Prometheus that
periodically poll each running instance of a system for metrics.

Many [vendors](https://opentelemetry.io/ecosystem/vendors/) exist to manage
storing and visualizing the data exported from a system. Notably, this includes
the big 3 cloud providers: AWS, Azure, and GCP. Open source solutions also exist
that you can run yourself, like [Grafana](https://grafana.com/).

## Conclusion

Observability can play a critical role in running production systems. Without
it, our understanding of the system is limited, as is our ability to
troubleshoot and learn from the data it provides. Stay tuned, as the next few
posts will take a hands-on approach to making APIs observable in different
languages.
