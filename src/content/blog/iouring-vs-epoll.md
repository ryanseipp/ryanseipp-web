---
title: "io_uring: A faster way to do I/O on Linux?"
author: Ryan Seipp
pubDate: 2023-07-25
description: Comparing the differences between epoll and io_uring for asynchronous I/O on Linux.
---

io_uring is the latest API exposed by Linux to perform async I/O. Originally built by Jens Axboe, this API was first accepted into Linux in 2019 with kernel version 5.1. It functions via two [ring buffers](https://en.wikipedia.org/wiki/Circular_buffer) which are shared by both the application and the kernel. The first of these buffers is the submission queue (SQ), where the application places submission queue entries (SQEs) onto the tail of the SQ, and the kernel reads SQEs from the buffer's head. The kernel will then process the requested I/O and place a completion queue entry (CQE) on the tail of the completion queue (CQ).

SQEs can be initialized to request a wide array of I/O be done, normally completed via synchronous and blocking syscalls. Starting with kernel 5.1, only a few operations were available. Notably these were the syscalls readv and writev, used for reading data from a socket/file, or writing to a socket/file. Nowadays, all major syscalls needed for TCP/UDP communication, and file I/O are available. Even some operations that can complete synchronously in the kernel have been added.

Once SQEs have been added to the SQ, the application only needs to make a single syscall to notify the kernel of available work to be done. Work is done entirely asynchronously, without blocking the application (unless desired). Only once the operation has completed, or failed, is a CQE produced. This is the foundation for a completion async I/O model, vs. the typical readiness based model. The latter polls or waits for when an operation is ready to be done, then must perform the syscall, rather than waiting for the actual result.

## Why is this important?

On the heels of the Spectre and Meltdown CPU vulnerabilities, the kernel was forced to implement security-related mitigations any time an application makes a syscall. Additionally, any time a syscall is made, there is some penalty for the CPU context switch that must occur from user-space to kernel-space and back. Both of these penalties can add up for very high performance workloads, such as a TCP, UDP, or HTTP server.

With an API like epoll, the application must make a syscall to wait for events, then additional syscalls for every operation that is ready to be done. In contrast, io_uring allows the application to queue up multiple requests for work, then make only a single syscall to submit the work. This effectively amortizes the overhead of context switching and CPU vulnerability mitigations over a much larger set of work to be done. Additionally, io_uring has added the ability for the kernel to poll the SQ for additional work. This is a busy loop, and effectively wastes CPU cycles and electricity, but means the application may be able to eliminate syscalls entirely for its core logic.

## Measurements

Enough talk, let's get to some benchmarks. Just how much of a difference does this really make vs an API like epoll? I've written some code to test the performance of both io_uring and epoll in Rust and Zig. The program will be effectively a TCP echo server, where the server will receive any request, and write a constant result back. Here's the main loop of the Rust epoll implementation, using the [mio](https://crates.io/crates/mio) library.

```rs
fn handle_connection_event(
  registry: &Registry,
  connection: &mut TcpStream,
  event: &Event,
) -> io::Result<bool> {
  if event.is_writable() {
    match connection.write(RESPONSE) {
        // handle errors or register the connection with a READABLE interest
    }
  }

  if event.is_readable() {
    let mut connection_closed = false;
    let mut received_data = vec![0; 1024];
    let mut bytes_read = 0;

    loop {
      match connection.read(&mut received_data[bytes_read..]) {
          // handle errors, resize if needed, and count bytes read
      }
    }

    if bytes_read != 0 {
      registry.reregister(
        connection,
        event.token(),
        Interest::WRITABLE.add(Interest::READABLE),
      )?;
    }

    if connection_closed {
      return Ok(true);
    }
  }

  Ok(false)
}

fn main() -> io::Result<()> {
  // TcpListener and epoll setup...

  // space to keep connections around
  let mut connections = Slab::with_capacity(2048);

  loop {
    poll.poll(&mut events, None)?;

    for event in events.iter() {
      match event.token() {
        SERVER => loop {
          let (mut connection, _address) = match server.accept() {
            Ok((connection, address)) => (connection, address),
            Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
              break;
            }
            Err(e) => {
              return Err(e);
            }
          };

          let entry = connections.vacant_entry();
          poll.registry().register(
            &mut connection,
            Token(entry.key()),
            Interest::READABLE,
          )?;
          entry.insert(connection);
        },
        token => {
          let done = if let Some(connection) = connections.get_mut(token.0) {
            handle_connection_event(poll.registry(), connection, event)?
          } else {
            false
          };

          if done {
            let mut connection = connections.remove(token.0);
            poll.registry().deregister(&mut connection)?;
          }
        }
      }
    }
  }
}
```

Whereas this is what the io_uring implementation in Rust looks like.

```rs
fn main() -> io::Result<()> {
  // io_uring and TcpListener setup

  // space for data to be read into from the network
  let mut buf_alloc = Slab::with_capacity(2048);

  loop {
    match submitter.submit_and_wait(1) {
      Ok(_) => (),
      Err(err) => return Err(err),
    }

    cq.sync();

    for cqe in &mut cq {
      let event = cqe.user_data();
      let result = cqe.result();

      // error handling

      match Op::from(event) {
        Op::Accept => {
          let conn_fd = result;
          if cqe.flags() & IORING_CQE_F_MORE == 0 {
            accept(&mut sq, listener.as_raw_fd(), &mut backlog);
          }
          receive(&mut sq, &mut buf_alloc, conn_fd, &mut backlog);
        }
        Op::Recv(fd, buf_idx) => {
          buf_alloc.remove(buf_idx as usize);

          if result == 0 {
            close(&mut sq, fd, &mut backlog);
          }

          send(&mut sq, fd, &mut backlog);
        }
        Op::Send(fd) => {
          receive(&mut sq, &mut buf_alloc, fd, &mut backlog);
        }
        Op::Close => {
          // perform cleanup if needed
        }
      }
    }
  }
}
```

You can view the code for both Rust and Zig implementations of io_uring and epoll on [GitHub](https://github.com/ryanseipp/iouring-test). With io_uring, user data can be set to correllate SQEs to CQEs. This allows us to keep track of certain state, such as the file descriptor of the connection, or the index of the buffer we told the kernel to read into. I'm certainly leaving out more of the io_uring code than the epoll code, so don't let the relative lengths of these snippets fool you. You can think of `accept`/`receive`/`send`/`close` as functions that prepare an SQE for the appropriate action.

So how do these implementations perform?

| Api      | Language | Median Req. Duration | p(99) Req. Duration | p(99.9) Req. Duration | Req/s   |
| -------- | -------- | -------------------- | ------------------- | --------------------- | ------- |
| epoll    | Rust     | 2.03ms               | 3.2ms               | 6.93ms                | 215,752 |
| epoll    | Zig      | 2.03ms               | 3.13ms              | 6.9ms                 | 221,851 |
| io_uring | Rust     | 1.68ms               | 2.28ms              | 6.08ms                | 272,415 |
| io_uring | Zig      | 1.65ms               | 2.17ms              | 5.9ms                 | 279,114 |

Not bad! That's nearly 1ms off p99 latencies, and roughly 25% more throughput from the io_uring implementations. There's more in the works too. io_uring allows the application to hand over buffer selection to the kernel. This allows for nice opcodes like `io_uring_prep_multishot_recv` which will continuously receive data for the connection and produce CQEs, all without the application needing to "rearm" the I/O request. io_uring also has a concept of linked requests, where SQEs can be effectively chained together. This would allow the application to submit a request to read, but timeout after a given period of time, as an example. To see more about the testing methodology, and the known flaws with the test run, check the README on my [GitHub](https://github.com/ryanseipp/iouring-test).

There's lots more to investigate with io_uring, and I'm excited for what's to come!
