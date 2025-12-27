// This file defines type aliases inside the test namespace `SyncKit.Server.Tests.Storage` so
// references like `Storage.DeltaEntry` and `Storage.IStorageAdapter` resolve to the
// real server types without editing all existing tests.

using System;
using System.Collections.Generic;

namespace SyncKit.Server.Tests.Storage;

using DeltaEntry = global::SyncKit.Server.Storage.DeltaEntry;
using IStorageAdapter = global::SyncKit.Server.Storage.IStorageAdapter;
using DocumentState = global::SyncKit.Server.Storage.DocumentState;