use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use synckit_core::crdt::FugueText;

/// Benchmark single character insert (target: <1ms)
fn bench_single_insert(c: &mut Criterion) {
    c.bench_function("fugue_single_insert", |b| {
        b.iter(|| {
            let mut text = FugueText::new("client1".to_string());
            black_box(text.insert(0, "a").unwrap());
        });
    });
}

/// Benchmark sequential typing (simulates real user typing)
fn bench_sequential_typing(c: &mut Criterion) {
    let mut group = c.benchmark_group("fugue_sequential_typing");

    for size in [10, 100, 1000, 10000].iter() {
        group.bench_with_input(BenchmarkId::from_parameter(size), size, |b, &size| {
            b.iter(|| {
                let mut text = FugueText::new("client1".to_string());
                for i in 0..size {
                    black_box(text.insert(i, "a").unwrap());
                }
            });
        });
    }

    group.finish();
}

/// Benchmark large batch insert
fn bench_large_batch_insert(c: &mut Criterion) {
    c.bench_function("fugue_large_batch_10k", |b| {
        b.iter(|| {
            let mut text = FugueText::new("client1".to_string());
            let large_text = "a".repeat(10000);
            black_box(text.insert(0, &large_text).unwrap());
        });
    });
}

/// Benchmark delete operations
fn bench_delete(c: &mut Criterion) {
    c.bench_function("fugue_delete_1000_chars", |b| {
        b.iter_batched(
            || {
                let mut text = FugueText::new("client1".to_string());
                let large_text = "a".repeat(1000);
                text.insert(0, &large_text).unwrap();
                text
            },
            |mut text| {
                black_box(text.delete(0, 1000).unwrap());
            },
            criterion::BatchSize::SmallInput,
        );
    });
}

/// Benchmark the famous Yjs 260K operations test
/// Target: < 500ms total
/// This simulates 260K sequential character insertions
fn bench_yjs_260k_ops(c: &mut Criterion) {
    let mut group = c.benchmark_group("fugue_yjs_benchmark");
    group.sample_size(10); // Reduce sample size for this heavy benchmark
    group.measurement_time(std::time::Duration::from_secs(30));

    // Start with smaller sizes to see the progression
    for ops in [1000, 10000, 50000, 100000, 260000].iter() {
        group.bench_with_input(BenchmarkId::from_parameter(ops), ops, |b, &ops| {
            b.iter(|| {
                let mut text = FugueText::new("client1".to_string());
                for i in 0..ops {
                    // Insert at end for O(1) amortized (best case for Phase 1)
                    black_box(text.insert(i, "a").unwrap());
                }
                // Verify final length
                assert_eq!(text.len(), ops);
            });
        });
    }

    group.finish();
}

/// Benchmark merge operations
fn bench_merge(c: &mut Criterion) {
    c.bench_function("fugue_merge_two_1k_docs", |b| {
        b.iter_batched(
            || {
                let mut text1 = FugueText::new("client1".to_string());
                let mut text2 = FugueText::new("client2".to_string());

                let text_1k = "a".repeat(1000);
                text1.insert(0, &text_1k).unwrap();

                let text_1k_2 = "b".repeat(1000);
                text2.insert(0, &text_1k_2).unwrap();

                (text1, text2)
            },
            |(mut text1, text2)| {
                text1.merge(&text2).unwrap();
                black_box(());
            },
            criterion::BatchSize::SmallInput,
        );
    });
}

/// Benchmark concurrent edits convergence
fn bench_concurrent_convergence(c: &mut Criterion) {
    c.bench_function("fugue_concurrent_3way_convergence", |b| {
        b.iter(|| {
            let mut text1 = FugueText::new("client1".to_string());
            let mut text2 = FugueText::new("client2".to_string());
            let mut text3 = FugueText::new("client3".to_string());

            // Each client makes 100 edits
            for i in 0..100 {
                text1.insert(i, "a").unwrap();
                text2.insert(i, "b").unwrap();
                text3.insert(i, "c").unwrap();
            }

            // Full mesh merge
            text1.merge(&text2).unwrap();
            text1.merge(&text3).unwrap();
            text2.merge(&text1).unwrap();
            text3.merge(&text1).unwrap();

            // Verify convergence
            let result = text1.to_string();
            assert_eq!(text2.to_string(), result);
            assert_eq!(text3.to_string(), result);
        });
    });
}

/// Benchmark serialization
fn bench_serialization(c: &mut Criterion) {
    c.bench_function("fugue_serialize_10k_doc", |b| {
        let mut text = FugueText::new("client1".to_string());
        let large_text = "a".repeat(10000);
        text.insert(0, &large_text).unwrap();

        b.iter(|| {
            black_box(serde_json::to_string(&text).unwrap());
        });
    });
}

/// Benchmark deserialization
fn bench_deserialization(c: &mut Criterion) {
    let mut text = FugueText::new("client1".to_string());
    let large_text = "a".repeat(10000);
    text.insert(0, &large_text).unwrap();
    let json = serde_json::to_string(&text).unwrap();

    c.bench_function("fugue_deserialize_10k_doc", |b| {
        b.iter(|| {
            black_box(serde_json::from_str::<FugueText>(&json).unwrap());
        });
    });
}

/// Benchmark memory efficiency (RLE optimization)
fn bench_rle_efficiency(c: &mut Criterion) {
    c.bench_function("fugue_rle_1000_sequential_chars", |b| {
        b.iter(|| {
            let mut text = FugueText::new("client1".to_string());

            // Sequential inserts at end should benefit from RLE
            for i in 0..1000 {
                text.insert(i, "a").unwrap();
            }

            // Verify final length
            assert_eq!(text.len(), 1000);
        });
    });
}

criterion_group!(
    benches,
    bench_single_insert,
    bench_sequential_typing,
    bench_large_batch_insert,
    bench_delete,
    bench_yjs_260k_ops,
    bench_merge,
    bench_concurrent_convergence,
    bench_serialization,
    bench_deserialization,
    bench_rle_efficiency,
);

criterion_main!(benches);
