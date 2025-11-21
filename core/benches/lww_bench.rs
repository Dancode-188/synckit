use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use serde_json::json;
use std::hint::black_box;
use synckit_core::document::Document;

/// Benchmark single field update
fn bench_single_field_update(c: &mut Criterion) {
    c.bench_function("single_field_update", |b| {
        let mut doc = Document::new("test-doc".to_string());
        let mut clock = 1u64;

        b.iter(|| {
            doc.set_field(
                black_box("field1".to_string()),
                black_box(json!("value")),
                black_box(clock),
                black_box("client1".to_string()),
            );
            clock += 1;
        });
    });
}

/// Benchmark field retrieval
fn bench_field_get(c: &mut Criterion) {
    let mut doc = Document::new("test-doc".to_string());
    doc.set_field(
        "field1".to_string(),
        json!("value"),
        1,
        "client1".to_string(),
    );

    c.bench_function("field_get", |b| {
        b.iter(|| {
            black_box(doc.get_field(&"field1".to_string()));
        });
    });
}

/// Benchmark merge operations with varying field counts
fn bench_document_merge(c: &mut Criterion) {
    let mut group = c.benchmark_group("document_merge");

    for field_count in [10, 50, 100, 500].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(field_count),
            field_count,
            |b, &field_count| {
                // Create two documents with many fields
                let mut doc1 = Document::new("doc1".to_string());
                let mut doc2 = Document::new("doc2".to_string());

                // Populate doc1 with fields (older timestamps)
                for i in 0..field_count {
                    doc1.set_field(
                        format!("field{}", i),
                        json!(format!("value1_{}", i)),
                        1,
                        "client1".to_string(),
                    );
                }

                // Populate doc2 with overlapping fields (newer timestamps)
                for i in 0..field_count {
                    doc2.set_field(
                        format!("field{}", i),
                        json!(format!("value2_{}", i)),
                        2,
                        "client2".to_string(),
                    );
                }

                b.iter(|| {
                    let mut doc_copy = doc1.clone();
                    black_box(doc_copy.merge(&doc2));
                });
            },
        );
    }
    group.finish();
}

/// Benchmark batch updates
fn bench_batch_updates(c: &mut Criterion) {
    let mut group = c.benchmark_group("batch_updates");

    for batch_size in [10, 100, 1000].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(batch_size),
            batch_size,
            |b, &batch_size| {
                let mut doc = Document::new("test-doc".to_string());

                b.iter(|| {
                    for i in 0..batch_size {
                        doc.set_field(
                            black_box(format!("field{}", i % 100)), // Reuse some fields
                            black_box(json!(format!("value{}", i))),
                            black_box(i as u64),
                            black_box("client1".to_string()),
                        );
                    }
                });
            },
        );
    }
    group.finish();
}

/// Benchmark conflict resolution (same timestamp, different clients)
fn bench_conflict_resolution(c: &mut Criterion) {
    c.bench_function("conflict_resolution", |b| {
        let mut doc = Document::new("test-doc".to_string());
        doc.set_field(
            "field1".to_string(),
            json!("value1"),
            1,
            "client1".to_string(),
        );

        b.iter(|| {
            // Try to set with same timestamp but different client
            doc.set_field(
                black_box("field1".to_string()),
                black_box(json!("value2")),
                black_box(1),
                black_box("client2".to_string()),
            );
        });
    });
}

/// Benchmark JSON serialization
fn bench_document_to_json(c: &mut Criterion) {
    let mut doc = Document::new("test-doc".to_string());

    // Add 100 fields
    for i in 0..100 {
        doc.set_field(
            format!("field{}", i),
            json!(format!("value{}", i)),
            1,
            "client1".to_string(),
        );
    }

    c.bench_function("document_to_json", |b| {
        b.iter(|| {
            black_box(doc.to_json());
        });
    });
}

criterion_group!(
    benches,
    bench_single_field_update,
    bench_field_get,
    bench_document_merge,
    bench_batch_updates,
    bench_conflict_resolution,
    bench_document_to_json,
);
criterion_main!(benches);
