window.BENCHMARK_DATA = {
  "lastUpdate": 1774752827250,
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
          "id": "8e6359b7cedbfcb795a85ee12cac394c4ebd40b4",
          "message": "fix(demo): allow typing \"?\" in editable areas (#112)\n\nSkip the help panel shortcut when focus is on an input, textarea,\nor contenteditable element so the character is inserted normally.\n\nFixes #109",
          "timestamp": "2026-02-17T00:37:42Z",
          "url": "https://github.com/Dancode-188/synckit/commit/8e6359b7cedbfcb795a85ee12cac394c4ebd40b4"
        },
        "date": 1771728003209,
        "tool": "cargo",
        "benches": [
          {
            "name": "single_field_update",
            "value": 77,
            "range": "± 1",
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
            "value": 2144,
            "range": "± 54",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/50",
            "value": 10638,
            "range": "± 111",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/100",
            "value": 20701,
            "range": "± 190",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/500",
            "value": 104742,
            "range": "± 1133",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/10",
            "value": 1751,
            "range": "± 29",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/100",
            "value": 18435,
            "range": "± 249",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/1000",
            "value": 136520,
            "range": "± 2780",
            "unit": "ns/iter"
          },
          {
            "name": "conflict_resolution",
            "value": 106,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "document_to_json",
            "value": 9226,
            "range": "± 72",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_tick",
            "value": 38,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_compare",
            "value": 143,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/2",
            "value": 105,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/5",
            "value": 229,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/10",
            "value": 495,
            "range": "± 10",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/50",
            "value": 3243,
            "range": "± 24",
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
            "value": 1837,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/10",
            "value": 700,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/100",
            "value": 6931,
            "range": "± 157",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/1000",
            "value": 70591,
            "range": "± 1374",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/10",
            "value": 1395,
            "range": "± 11",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/50",
            "value": 10644,
            "range": "± 91",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/100",
            "value": 20882,
            "range": "± 159",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/500",
            "value": 113048,
            "range": "± 580",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/10",
            "value": 1543,
            "range": "± 31",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/25",
            "value": 5018,
            "range": "± 281",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/50",
            "value": 10572,
            "range": "± 77",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/100",
            "value": 20640,
            "range": "± 337",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/10",
            "value": 2108,
            "range": "± 58",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/50",
            "value": 10123,
            "range": "± 146",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/100",
            "value": 19772,
            "range": "± 246",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/500",
            "value": 103108,
            "range": "± 957",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/2",
            "value": 16387,
            "range": "± 391",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/5",
            "value": 49708,
            "range": "± 797",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/10",
            "value": 105713,
            "range": "± 1558",
            "unit": "ns/iter"
          },
          {
            "name": "empty_delta",
            "value": 2924,
            "range": "± 16",
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
          "id": "8e6359b7cedbfcb795a85ee12cac394c4ebd40b4",
          "message": "fix(demo): allow typing \"?\" in editable areas (#112)\n\nSkip the help panel shortcut when focus is on an input, textarea,\nor contenteditable element so the character is inserted normally.\n\nFixes #109",
          "timestamp": "2026-02-17T00:37:42Z",
          "url": "https://github.com/Dancode-188/synckit/commit/8e6359b7cedbfcb795a85ee12cac394c4ebd40b4"
        },
        "date": 1772333215829,
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
            "value": 2218,
            "range": "± 74",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/50",
            "value": 10733,
            "range": "± 148",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/100",
            "value": 21104,
            "range": "± 210",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/500",
            "value": 105824,
            "range": "± 2453",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/10",
            "value": 1833,
            "range": "± 32",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/100",
            "value": 18409,
            "range": "± 322",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/1000",
            "value": 138461,
            "range": "± 1535",
            "unit": "ns/iter"
          },
          {
            "name": "conflict_resolution",
            "value": 105,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "document_to_json",
            "value": 10558,
            "range": "± 44",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_tick",
            "value": 38,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_compare",
            "value": 145,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/2",
            "value": 107,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/5",
            "value": 234,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/10",
            "value": 520,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/50",
            "value": 3326,
            "range": "± 24",
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
            "value": 1877,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/10",
            "value": 692,
            "range": "± 10",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/100",
            "value": 7001,
            "range": "± 144",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/1000",
            "value": 69407,
            "range": "± 944",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/10",
            "value": 1417,
            "range": "± 46",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/50",
            "value": 10740,
            "range": "± 201",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/100",
            "value": 20967,
            "range": "± 374",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/500",
            "value": 115758,
            "range": "± 2200",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/10",
            "value": 1458,
            "range": "± 29",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/25",
            "value": 4965,
            "range": "± 77",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/50",
            "value": 10779,
            "range": "± 139",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/100",
            "value": 21084,
            "range": "± 3033",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/10",
            "value": 2129,
            "range": "± 93",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/50",
            "value": 10260,
            "range": "± 425",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/100",
            "value": 20009,
            "range": "± 591",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/500",
            "value": 103965,
            "range": "± 2711",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/2",
            "value": 16865,
            "range": "± 369",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/5",
            "value": 50768,
            "range": "± 864",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/10",
            "value": 107927,
            "range": "± 1716",
            "unit": "ns/iter"
          },
          {
            "name": "empty_delta",
            "value": 2963,
            "range": "± 12",
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
          "id": "8e6359b7cedbfcb795a85ee12cac394c4ebd40b4",
          "message": "fix(demo): allow typing \"?\" in editable areas (#112)\n\nSkip the help panel shortcut when focus is on an input, textarea,\nor contenteditable element so the character is inserted normally.\n\nFixes #109",
          "timestamp": "2026-02-17T00:37:42Z",
          "url": "https://github.com/Dancode-188/synckit/commit/8e6359b7cedbfcb795a85ee12cac394c4ebd40b4"
        },
        "date": 1772937453438,
        "tool": "cargo",
        "benches": [
          {
            "name": "single_field_update",
            "value": 77,
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
            "value": 2221,
            "range": "± 75",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/50",
            "value": 10722,
            "range": "± 124",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/100",
            "value": 21014,
            "range": "± 176",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/500",
            "value": 106768,
            "range": "± 668",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/10",
            "value": 1742,
            "range": "± 30",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/100",
            "value": 18769,
            "range": "± 282",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/1000",
            "value": 148058,
            "range": "± 2388",
            "unit": "ns/iter"
          },
          {
            "name": "conflict_resolution",
            "value": 103,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "document_to_json",
            "value": 11525,
            "range": "± 205",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_tick",
            "value": 38,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_compare",
            "value": 142,
            "range": "± 0",
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
            "value": 234,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/10",
            "value": 529,
            "range": "± 10",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/50",
            "value": 3305,
            "range": "± 42",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_get",
            "value": 20,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_clone",
            "value": 1898,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/10",
            "value": 690,
            "range": "± 8",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/100",
            "value": 6882,
            "range": "± 145",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/1000",
            "value": 68883,
            "range": "± 1244",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/10",
            "value": 1426,
            "range": "± 16",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/50",
            "value": 10799,
            "range": "± 73",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/100",
            "value": 21279,
            "range": "± 171",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/500",
            "value": 113632,
            "range": "± 722",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/10",
            "value": 1470,
            "range": "± 20",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/25",
            "value": 5023,
            "range": "± 34",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/50",
            "value": 10851,
            "range": "± 77",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/100",
            "value": 21246,
            "range": "± 128",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/10",
            "value": 2179,
            "range": "± 66",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/50",
            "value": 10351,
            "range": "± 159",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/100",
            "value": 20398,
            "range": "± 268",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/500",
            "value": 103601,
            "range": "± 1099",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/2",
            "value": 16731,
            "range": "± 101",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/5",
            "value": 50159,
            "range": "± 864",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/10",
            "value": 106832,
            "range": "± 1607",
            "unit": "ns/iter"
          },
          {
            "name": "empty_delta",
            "value": 2974,
            "range": "± 7",
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
          "id": "8e6359b7cedbfcb795a85ee12cac394c4ebd40b4",
          "message": "fix(demo): allow typing \"?\" in editable areas (#112)\n\nSkip the help panel shortcut when focus is on an input, textarea,\nor contenteditable element so the character is inserted normally.\n\nFixes #109",
          "timestamp": "2026-02-17T00:37:42Z",
          "url": "https://github.com/Dancode-188/synckit/commit/8e6359b7cedbfcb795a85ee12cac394c4ebd40b4"
        },
        "date": 1773543099764,
        "tool": "cargo",
        "benches": [
          {
            "name": "single_field_update",
            "value": 84,
            "range": "± 1",
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
            "value": 2215,
            "range": "± 117",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/50",
            "value": 10699,
            "range": "± 159",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/100",
            "value": 20965,
            "range": "± 198",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/500",
            "value": 105493,
            "range": "± 621",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/10",
            "value": 1794,
            "range": "± 25",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/100",
            "value": 19683,
            "range": "± 179",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/1000",
            "value": 138902,
            "range": "± 2831",
            "unit": "ns/iter"
          },
          {
            "name": "conflict_resolution",
            "value": 103,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "document_to_json",
            "value": 10040,
            "range": "± 19",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_tick",
            "value": 37,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_compare",
            "value": 149,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/2",
            "value": 106,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/5",
            "value": 232,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/10",
            "value": 512,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/50",
            "value": 3281,
            "range": "± 39",
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
            "value": 1890,
            "range": "± 8",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/10",
            "value": 695,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/100",
            "value": 6963,
            "range": "± 159",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/1000",
            "value": 69470,
            "range": "± 639",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/10",
            "value": 1422,
            "range": "± 13",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/50",
            "value": 10694,
            "range": "± 83",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/100",
            "value": 20940,
            "range": "± 105",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/500",
            "value": 116595,
            "range": "± 1482",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/10",
            "value": 1474,
            "range": "± 20",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/25",
            "value": 4984,
            "range": "± 38",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/50",
            "value": 10825,
            "range": "± 126",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/100",
            "value": 21040,
            "range": "± 121",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/10",
            "value": 2232,
            "range": "± 85",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/50",
            "value": 10208,
            "range": "± 173",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/100",
            "value": 20371,
            "range": "± 220",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/500",
            "value": 104636,
            "range": "± 2031",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/2",
            "value": 16776,
            "range": "± 117",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/5",
            "value": 50557,
            "range": "± 790",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/10",
            "value": 107169,
            "range": "± 1382",
            "unit": "ns/iter"
          },
          {
            "name": "empty_delta",
            "value": 2843,
            "range": "± 12",
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
          "id": "8e6359b7cedbfcb795a85ee12cac394c4ebd40b4",
          "message": "fix(demo): allow typing \"?\" in editable areas (#112)\n\nSkip the help panel shortcut when focus is on an input, textarea,\nor contenteditable element so the character is inserted normally.\n\nFixes #109",
          "timestamp": "2026-02-17T00:37:42Z",
          "url": "https://github.com/Dancode-188/synckit/commit/8e6359b7cedbfcb795a85ee12cac394c4ebd40b4"
        },
        "date": 1774147409186,
        "tool": "cargo",
        "benches": [
          {
            "name": "single_field_update",
            "value": 76,
            "range": "± 1",
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
            "value": 2204,
            "range": "± 110",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/50",
            "value": 10492,
            "range": "± 138",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/100",
            "value": 20678,
            "range": "± 202",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/500",
            "value": 105242,
            "range": "± 2259",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/10",
            "value": 1814,
            "range": "± 43",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/100",
            "value": 18198,
            "range": "± 298",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/1000",
            "value": 137027,
            "range": "± 1819",
            "unit": "ns/iter"
          },
          {
            "name": "conflict_resolution",
            "value": 104,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "document_to_json",
            "value": 9820,
            "range": "± 431",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_tick",
            "value": 38,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_compare",
            "value": 144,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/2",
            "value": 113,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/5",
            "value": 248,
            "range": "± 11",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/10",
            "value": 534,
            "range": "± 27",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/50",
            "value": 3399,
            "range": "± 83",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_get",
            "value": 20,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_clone",
            "value": 1870,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/10",
            "value": 689,
            "range": "± 17",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/100",
            "value": 6831,
            "range": "± 128",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/1000",
            "value": 68524,
            "range": "± 2731",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/10",
            "value": 1433,
            "range": "± 12",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/50",
            "value": 10780,
            "range": "± 133",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/100",
            "value": 21019,
            "range": "± 134",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/500",
            "value": 113737,
            "range": "± 1136",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/10",
            "value": 1466,
            "range": "± 17",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/25",
            "value": 4940,
            "range": "± 204",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/50",
            "value": 10820,
            "range": "± 101",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/100",
            "value": 20983,
            "range": "± 149",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/10",
            "value": 2153,
            "range": "± 59",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/50",
            "value": 10316,
            "range": "± 193",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/100",
            "value": 20189,
            "range": "± 350",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/500",
            "value": 103828,
            "range": "± 2811",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/2",
            "value": 16678,
            "range": "± 140",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/5",
            "value": 49983,
            "range": "± 804",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/10",
            "value": 106579,
            "range": "± 1313",
            "unit": "ns/iter"
          },
          {
            "name": "empty_delta",
            "value": 2953,
            "range": "± 21",
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
          "id": "8e6359b7cedbfcb795a85ee12cac394c4ebd40b4",
          "message": "fix(demo): allow typing \"?\" in editable areas (#112)\n\nSkip the help panel shortcut when focus is on an input, textarea,\nor contenteditable element so the character is inserted normally.\n\nFixes #109",
          "timestamp": "2026-02-17T00:37:42Z",
          "url": "https://github.com/Dancode-188/synckit/commit/8e6359b7cedbfcb795a85ee12cac394c4ebd40b4"
        },
        "date": 1774752826695,
        "tool": "cargo",
        "benches": [
          {
            "name": "single_field_update",
            "value": 75,
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
            "value": 2211,
            "range": "± 66",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/50",
            "value": 10758,
            "range": "± 182",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/100",
            "value": 20964,
            "range": "± 214",
            "unit": "ns/iter"
          },
          {
            "name": "document_merge/500",
            "value": 106169,
            "range": "± 622",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/10",
            "value": 1797,
            "range": "± 41",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/100",
            "value": 18491,
            "range": "± 330",
            "unit": "ns/iter"
          },
          {
            "name": "batch_updates/1000",
            "value": 142629,
            "range": "± 3629",
            "unit": "ns/iter"
          },
          {
            "name": "conflict_resolution",
            "value": 104,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "document_to_json",
            "value": 11923,
            "range": "± 36",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_tick",
            "value": 38,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_compare",
            "value": 149,
            "range": "± 0",
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
            "value": 230,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/10",
            "value": 485,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "vector_clock_merge/50",
            "value": 3268,
            "range": "± 45",
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
            "value": 1903,
            "range": "± 20",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/10",
            "value": 684,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/100",
            "value": 6735,
            "range": "± 166",
            "unit": "ns/iter"
          },
          {
            "name": "concurrent_ticks/1000",
            "value": 68778,
            "range": "± 533",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/10",
            "value": 1453,
            "range": "± 15",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/50",
            "value": 10817,
            "range": "± 108",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/100",
            "value": 21435,
            "range": "± 160",
            "unit": "ns/iter"
          },
          {
            "name": "compute_delta/500",
            "value": 116561,
            "range": "± 528",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/10",
            "value": 1475,
            "range": "± 12",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/25",
            "value": 4992,
            "range": "± 49",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/50",
            "value": 10849,
            "range": "± 78",
            "unit": "ns/iter"
          },
          {
            "name": "compute_partial_delta/100",
            "value": 21399,
            "range": "± 172",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/10",
            "value": 2163,
            "range": "± 61",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/50",
            "value": 10242,
            "range": "± 130",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/100",
            "value": 20251,
            "range": "± 304",
            "unit": "ns/iter"
          },
          {
            "name": "apply_delta/500",
            "value": 104060,
            "range": "± 3773",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/2",
            "value": 16737,
            "range": "± 118",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/5",
            "value": 50887,
            "range": "± 785",
            "unit": "ns/iter"
          },
          {
            "name": "merge_deltas/10",
            "value": 108381,
            "range": "± 1020",
            "unit": "ns/iter"
          },
          {
            "name": "empty_delta",
            "value": 2888,
            "range": "± 8",
            "unit": "ns/iter"
          }
        ]
      }
    ]
  }
}