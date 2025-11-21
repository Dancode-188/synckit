use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use serde_json::json;
use std::hint::black_box;
use synckit_core::document::Document;
use synckit_core::sync::{apply_delta, compute_delta, merge_deltas};

/// Benchmark delta computation for various document sizes
fn bench_compute_delta(c: &mut Criterion) {
    let mut group = c.benchmark_group("compute_delta");

    for field_count in [10, 50, 100, 500].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(field_count),
            field_count,
            |b, &field_count| {
                let mut old_doc = Document::new("doc1".to_string());
                let mut new_doc = Document::new("doc1".to_string());

                // Populate both documents
                for i in 0..field_count {
                    old_doc.set_field(
                        format!("field{}", i),
                        json!(format!("old_value_{}", i)),
                        1,
                        "client1".to_string(),
                    );
                    new_doc.set_field(
                        format!("field{}", i),
                        json!(format!("new_value_{}", i)),
                        2,
                        "client1".to_string(),
                    );
                }

                b.iter(|| {
                    black_box(compute_delta(black_box(&old_doc), black_box(&new_doc)));
                });
            },
        );
    }
    group.finish();
}

/// Benchmark delta computation with partial changes
fn bench_compute_partial_delta(c: &mut Criterion) {
    let mut group = c.benchmark_group("compute_partial_delta");

    for change_percent in [10, 25, 50, 100].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(change_percent),
            change_percent,
            |b, &change_percent| {
                let mut old_doc = Document::new("doc1".to_string());
                let mut new_doc = old_doc.clone();

                let field_count = 100;
                let changed_fields = (field_count * change_percent) / 100;

                // Populate old document
                for i in 0..field_count {
                    old_doc.set_field(
                        format!("field{}", i),
                        json!(format!("old_value_{}", i)),
                        1,
                        "client1".to_string(),
                    );
                }

                // Change only some fields
                for i in 0..changed_fields {
                    new_doc.set_field(
                        format!("field{}", i),
                        json!(format!("new_value_{}", i)),
                        2,
                        "client1".to_string(),
                    );
                }

                b.iter(|| {
                    black_box(compute_delta(black_box(&old_doc), black_box(&new_doc)));
                });
            },
        );
    }
    group.finish();
}

/// Benchmark delta application
fn bench_apply_delta(c: &mut Criterion) {
    let mut group = c.benchmark_group("apply_delta");

    for field_count in [10, 50, 100, 500].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(field_count),
            field_count,
            |b, &field_count| {
                let mut base_doc = Document::new("doc1".to_string());
                let mut changed_doc = Document::new("doc1".to_string());

                // Populate base document
                for i in 0..field_count {
                    base_doc.set_field(
                        format!("field{}", i),
                        json!(format!("old_value_{}", i)),
                        1,
                        "client1".to_string(),
                    );
                }

                // Create changed document
                for i in 0..field_count {
                    changed_doc.set_field(
                        format!("field{}", i),
                        json!(format!("new_value_{}", i)),
                        2,
                        "client2".to_string(),
                    );
                }

                let delta = compute_delta(&base_doc, &changed_doc);

                b.iter(|| {
                    let mut doc_copy = base_doc.clone();
                    black_box(apply_delta(black_box(&mut doc_copy), black_box(&delta)));
                });
            },
        );
    }
    group.finish();
}

/// Benchmark delta merging
fn bench_merge_deltas(c: &mut Criterion) {
    let mut group = c.benchmark_group("merge_deltas");

    for delta_count in [2, 5, 10].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(delta_count),
            delta_count,
            |b, &delta_count| {
                let mut base_doc = Document::new("doc1".to_string());

                // Create base document
                for i in 0..50 {
                    base_doc.set_field(
                        format!("field{}", i),
                        json!(format!("base_value_{}", i)),
                        1,
                        "client0".to_string(),
                    );
                }

                // Create multiple deltas
                let mut deltas = Vec::new();
                for d in 0..delta_count {
                    let mut changed_doc = base_doc.clone();
                    for i in 0..50 {
                        changed_doc.set_field(
                            format!("field{}", i),
                            json!(format!("value_{}_{}", d, i)),
                            (d + 2) as u64,
                            format!("client{}", d),
                        );
                    }
                    deltas.push(compute_delta(&base_doc, &changed_doc));
                }

                b.iter(|| {
                    // Merge all deltas pairwise
                    let mut result = deltas[0].clone();
                    for i in 1..deltas.len() {
                        result = merge_deltas(&result, &deltas[i]);
                    }
                    black_box(result);
                });
            },
        );
    }
    group.finish();
}

/// Benchmark empty delta (no changes)
fn bench_empty_delta(c: &mut Criterion) {
    let mut doc = Document::new("doc1".to_string());

    for i in 0..100 {
        doc.set_field(
            format!("field{}", i),
            json!(format!("value_{}", i)),
            1,
            "client1".to_string(),
        );
    }

    c.bench_function("empty_delta", |b| {
        b.iter(|| {
            black_box(compute_delta(black_box(&doc), black_box(&doc)));
        });
    });
}

criterion_group!(
    benches,
    bench_compute_delta,
    bench_compute_partial_delta,
    bench_apply_delta,
    bench_merge_deltas,
    bench_empty_delta,
);
criterion_main!(benches);
