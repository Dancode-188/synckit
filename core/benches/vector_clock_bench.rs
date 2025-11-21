use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use std::hint::black_box;
use synckit_core::sync::vector_clock::VectorClock;

/// Benchmark clock tick operation
fn bench_tick(c: &mut Criterion) {
    let mut clock = VectorClock::new();
    let client_id = "client1".to_string();

    c.bench_function("vector_clock_tick", |b| {
        b.iter(|| {
            clock.tick(black_box(&client_id));
        });
    });
}

/// Benchmark clock comparison
fn bench_compare(c: &mut Criterion) {
    let mut clock1 = VectorClock::new();
    let mut clock2 = VectorClock::new();

    let client1 = "client1".to_string();
    let client2 = "client2".to_string();

    clock1.tick(&client1);
    clock1.tick(&client2);
    clock2.tick(&client1);

    c.bench_function("vector_clock_compare", |b| {
        b.iter(|| {
            black_box(clock1.compare(&clock2));
        });
    });
}

/// Benchmark clock merging with varying numbers of clients
fn bench_merge(c: &mut Criterion) {
    let mut group = c.benchmark_group("vector_clock_merge");

    for client_count in [2, 5, 10, 50].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(client_count),
            client_count,
            |b, &client_count| {
                let mut clock1 = VectorClock::new();
                let mut clock2 = VectorClock::new();

                // Populate clocks with different clients
                for i in 0..client_count {
                    let client_id1 = format!("client{}", i);
                    let client_id2 = format!("client{}", (i + client_count / 2) % client_count);
                    clock1.tick(&client_id1);
                    clock2.tick(&client_id2);
                }

                b.iter(|| {
                    let mut clock_copy = clock1.clone();
                    black_box(clock_copy.merge(&clock2));
                });
            },
        );
    }
    group.finish();
}

/// Benchmark getting clock value for a client
fn bench_get_clock(c: &mut Criterion) {
    let mut clock = VectorClock::new();
    let client1 = "client1".to_string();
    let client2 = "client2".to_string();

    clock.tick(&client1);
    clock.tick(&client2);

    c.bench_function("vector_clock_get", |b| {
        b.iter(|| {
            black_box(clock.get(black_box(&client1)));
        });
    });
}

/// Benchmark clock serialization (indirectly via clone)
fn bench_clone(c: &mut Criterion) {
    let mut clock = VectorClock::new();

    // Create a clock with many clients
    for i in 0..50 {
        let client_id = format!("client{}", i);
        clock.tick(&client_id);
    }

    c.bench_function("vector_clock_clone", |b| {
        b.iter(|| {
            black_box(clock.clone());
        });
    });
}

/// Benchmark concurrent clock updates (simulated)
fn bench_concurrent_ticks(c: &mut Criterion) {
    let mut group = c.benchmark_group("concurrent_ticks");

    for tick_count in [10, 100, 1000].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(tick_count),
            tick_count,
            |b, &tick_count| {
                let mut clock = VectorClock::new();

                b.iter(|| {
                    for i in 0..tick_count {
                        let client_id = format!("client{}", i % 5);
                        clock.tick(black_box(&client_id));
                    }
                });
            },
        );
    }
    group.finish();
}

criterion_group!(
    benches,
    bench_tick,
    bench_compare,
    bench_merge,
    bench_get_clock,
    bench_clone,
    bench_concurrent_ticks,
);
criterion_main!(benches);
