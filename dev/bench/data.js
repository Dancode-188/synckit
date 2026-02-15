window.BENCHMARK_DATA = {
  "lastUpdate": 1771123459854,
  "repoUrl": "https://github.com/Dancode-188/synckit",
  "entries": {
    "Rust Benchmark": [
      {
        "commit": {
          "author": {
            "name": "dancode-188",
            "username": "Dancode-188",
            "email": "danbitengo@gmail.com"
          },
          "committer": {
            "name": "dancode-188",
            "username": "Dancode-188",
            "email": "danbitengo@gmail.com"
          },
          "id": "712e74ed5794114f0a61e25d5687e28fe42ca467",
          "message": "fix(ci): grant write permission for benchmark data push\n\nThe benchmark-action needs contents: write to push results to the\ngh-pages branch.",
          "timestamp": "2026-02-08T17:31:44Z",
          "url": "https://github.com/Dancode-188/synckit/commit/712e74ed5794114f0a61e25d5687e28fe42ca467"
        },
        "date": 1770572473720,
        "tool": "cargo",
        "benches": [
          {
            "name": "single_field_update",
            "value": 76,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "field_get",
            "value": 29,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/10",
            "value": 2147,
            "range": "± 111",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/50",
            "value": 10573,
            "range": "± 136",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/100",
            "value": 20673,
            "range": "± 223",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/500",
            "value": 105123,
            "range": "± 4091",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/10",
            "value": 1737,
            "range": "± 26",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/100",
            "value": 17634,
            "range": "± 411",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/1000",
            "value": 134055,
            "range": "± 1574",
            "unit": "ns/iter"
          },
          {
            "name": "conflict_resolution",
            "value": 105,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "document_to_json",
            "value": 11606,
            "range": "± 44",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_tick",
            "value": 38,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_compare",
            "value": 143,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/2",
            "value": 107,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/5",
            "value": 231,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/10",
            "value": 524,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/50",
            "value": 3311,
            "range": "± 65",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_get",
            "value": 21,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_clone",
            "value": 1870,
            "range": "± 112",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/10",
            "value": 690,
            "range": "± 15",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/100",
            "value": 7100,
            "range": "± 145",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/1000",
            "value": 70718,
            "range": "± 1373",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/10",
            "value": 1397,
            "range": "± 22",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/50",
            "value": 10579,
            "range": "± 155",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/100",
            "value": 20797,
            "range": "± 158",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/500",
            "value": 113934,
            "range": "± 488",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/10",
            "value": 1456,
            "range": "± 15",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/25",
            "value": 4900,
            "range": "± 66",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/50",
            "value": 10636,
            "range": "± 104",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/100",
            "value": 20646,
            "range": "± 135",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/10",
            "value": 2132,
            "range": "± 63",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/50",
            "value": 10084,
            "range": "± 131",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/100",
            "value": 19904,
            "range": "± 181",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/500",
            "value": 103645,
            "range": "± 932",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/2",
            "value": 16465,
            "range": "± 336",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/5",
            "value": 50157,
            "range": "± 2514",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/10",
            "value": 105984,
            "range": "± 1563",
            "unit": "ns/iter"
          },
          {
            "name": "empty_delta",
            "value": 2944,
            "range": "± 10",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "Daniel Bitengo",
            "username": "Dancode-188",
            "email": "danbitengo@gmail.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "4f001bcd95df68c617cd5156088be0ddc57e915f",
          "message": "release: v0.3.0 — Production-Ready Multi-Language Servers\n\nv0.3.0: Production-Ready Multi-Language Servers",
          "timestamp": "2026-02-10T13:44:13Z",
          "url": "https://github.com/Dancode-188/synckit/commit/4f001bcd95df68c617cd5156088be0ddc57e915f"
        },
        "date": 1771123459231,
        "tool": "cargo",
        "benches": [
          {
            "name": "single_field_update",
            "value": 76,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "field_get",
            "value": 28,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/10",
            "value": 2207,
            "range": "± 70",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/50",
            "value": 10675,
            "range": "± 133",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/100",
            "value": 21475,
            "range": "± 455",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/500",
            "value": 105605,
            "range": "± 1186",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/10",
            "value": 1837,
            "range": "± 30",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/100",
            "value": 18112,
            "range": "± 377",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/1000",
            "value": 136271,
            "range": "± 4017",
            "unit": "ns/iter"
          },
          {
            "name": "conflict_resolution",
            "value": 102,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "document_to_json",
            "value": 9468,
            "range": "± 250",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_tick",
            "value": 39,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_compare",
            "value": 143,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/2",
            "value": 107,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/5",
            "value": 234,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/10",
            "value": 519,
            "range": "± 12",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/50",
            "value": 3348,
            "range": "± 38",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_get",
            "value": 21,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_clone",
            "value": 1916,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/10",
            "value": 706,
            "range": "± 12",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/100",
            "value": 7083,
            "range": "± 142",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/1000",
            "value": 70708,
            "range": "± 1790",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/10",
            "value": 1401,
            "range": "± 26",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/50",
            "value": 10757,
            "range": "± 100",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/100",
            "value": 21245,
            "range": "± 108",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/500",
            "value": 116149,
            "range": "± 1347",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/10",
            "value": 1470,
            "range": "± 17",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/25",
            "value": 5379,
            "range": "± 229",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/50",
            "value": 10772,
            "range": "± 165",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/100",
            "value": 21238,
            "range": "± 130",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/10",
            "value": 2177,
            "range": "± 81",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/50",
            "value": 10314,
            "range": "± 170",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/100",
            "value": 19921,
            "range": "± 228",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/500",
            "value": 102099,
            "range": "± 2604",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/2",
            "value": 16531,
            "range": "± 167",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/5",
            "value": 50112,
            "range": "± 798",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/10",
            "value": 107569,
            "range": "± 1320",
            "unit": "ns/iter"
          },
          {
            "name": "empty_delta",
            "value": 2942,
            "range": "± 8",
            "unit": "ns/iter"
          }
        ]
      }
    ]
  }
}