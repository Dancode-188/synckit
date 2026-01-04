/**
 * Storage Adapter Performance Benchmark
 * Compares OPFS vs IndexedDB for SyncKit operations
 */
import { OPFSStorage, IndexedDBStorage } from '../dist/index.mjs';
// Generate realistic document data
function generateDocument(id, size) {
    const sizeMap = {
        small: 10, // 10 todos
        medium: 100, // 100 todos
        large: 1000 // 1000 todos
    };
    const count = sizeMap[size];
    const todos = Array.from({ length: count }, (_, i) => ({
        id: `todo-${i}`,
        text: `Task ${i}: Lorem ipsum dolor sit amet`,
        completed: Math.random() > 0.5,
        createdBy: 'benchmark-user',
        createdAt: Date.now()
    }));
    return {
        id,
        data: { todos },
        version: { 'client-benchmark': count },
        updatedAt: Date.now()
    };
}
// Run benchmark for a specific operation
async function benchmarkOperation(adapter, operation, fn, iterations) {
    // Warm up
    await fn();
    // Actual benchmark
    const startTime = performance.now();
    for (let i = 0; i < iterations; i++) {
        await fn();
    }
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;
    const opsPerSecond = (iterations / totalTime) * 1000;
    return {
        adapter: adapter.constructor.name,
        operation,
        totalTime,
        avgTime,
        opsPerSecond,
        iterations
    };
}
// Main benchmark suite
async function runBenchmarks() {
    console.log('🏁 Starting Storage Adapter Benchmarks\n');
    const results = [];
    const iterations = 100; // Number of operations to test
    // Test both adapters
    const adapters = [
        { name: 'IndexedDB', adapter: new IndexedDBStorage('benchmark-idb') },
        { name: 'OPFS', adapter: new OPFSStorage('benchmark-opfs') }
    ];
    for (const { name, adapter } of adapters) {
        console.log(`\n📊 Testing ${name}...`);
        try {
            // Initialize
            await adapter.init();
            await adapter.clear(); // Start fresh
            // Benchmark: Write small documents
            console.log('  ⏱️  Write (small docs)...');
            const writeSmallResult = await benchmarkOperation(adapter, 'Write Small (10 items)', async () => {
                const doc = generateDocument(`doc-${Math.random()}`, 'small');
                await adapter.set(doc.id, doc);
            }, iterations);
            results.push(writeSmallResult);
            // Benchmark: Write medium documents
            console.log('  ⏱️  Write (medium docs)...');
            const writeMediumResult = await benchmarkOperation(adapter, 'Write Medium (100 items)', async () => {
                const doc = generateDocument(`doc-${Math.random()}`, 'medium');
                await adapter.set(doc.id, doc);
            }, iterations);
            results.push(writeMediumResult);
            // Benchmark: Write large documents
            console.log('  ⏱️  Write (large docs)...');
            const writeLargeResult = await benchmarkOperation(adapter, 'Write Large (1000 items)', async () => {
                const doc = generateDocument(`doc-${Math.random()}`, 'large');
                await adapter.set(doc.id, doc);
            }, 50 // Fewer iterations for large docs
            );
            results.push(writeLargeResult);
            // Set up documents for read benchmark
            const readDocs = Array.from({ length: iterations }, (_, i) => generateDocument(`read-doc-${i}`, 'medium'));
            for (const doc of readDocs) {
                await adapter.set(doc.id, doc);
            }
            // Benchmark: Read
            console.log('  ⏱️  Read...');
            let readIndex = 0;
            const readResult = await benchmarkOperation(adapter, 'Read', async () => {
                await adapter.get(readDocs[readIndex % readDocs.length].id);
                readIndex++;
            }, iterations);
            results.push(readResult);
            // Benchmark: List
            console.log('  ⏱️  List...');
            const listResult = await benchmarkOperation(adapter, 'List', async () => {
                await adapter.list();
            }, iterations);
            results.push(listResult);
            // Benchmark: Delete
            console.log('  ⏱️  Delete...');
            const deleteDocs = Array.from({ length: iterations }, (_, i) => generateDocument(`delete-doc-${i}`, 'small'));
            for (const doc of deleteDocs) {
                await adapter.set(doc.id, doc);
            }
            let deleteIndex = 0;
            const deleteResult = await benchmarkOperation(adapter, 'Delete', async () => {
                await adapter.delete(deleteDocs[deleteIndex % deleteDocs.length].id);
                deleteIndex++;
            }, iterations);
            results.push(deleteResult);
            // Clean up
            await adapter.clear();
            console.log(`  ✅ ${name} benchmarks complete`);
        }
        catch (error) {
            console.error(`  ❌ Error benchmarking ${name}:`, error);
        }
    }
    return results;
}
// Display results
function displayResults(results) {
    console.log('\n\n📈 BENCHMARK RESULTS\n');
    console.log('='.repeat(80));
    // Group by operation
    const operations = [...new Set(results.map(r => r.operation))];
    for (const operation of operations) {
        const opResults = results.filter(r => r.operation === operation);
        console.log(`\n${operation}:`);
        console.log('-'.repeat(80));
        for (const result of opResults) {
            console.log(`  ${result.adapter.padEnd(15)} | ${result.avgTime.toFixed(2)}ms avg | ${result.opsPerSecond.toFixed(0)} ops/sec`);
        }
        // Calculate speedup
        if (opResults.length === 2) {
            const idb = opResults.find(r => r.adapter === 'IndexedDBStorage');
            const opfs = opResults.find(r => r.adapter === 'OPFSStorage');
            if (idb && opfs) {
                const speedup = idb.avgTime / opfs.avgTime;
                const faster = speedup > 1 ? 'faster' : 'slower';
                console.log(`\n  → OPFS is ${Math.abs(speedup).toFixed(2)}x ${faster} than IndexedDB`);
            }
        }
    }
    console.log('\n' + '='.repeat(80));
}
// Export results to JSON
function exportResults(results) {
    return JSON.stringify({
        timestamp: new Date().toISOString(),
        platform: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js',
            platform: typeof navigator !== 'undefined' ? navigator.platform : process.platform
        },
        results
    }, null, 2);
}
// Run if executed directly
if (typeof window !== 'undefined') {
    // Browser environment
    console.log('Running in browser - call runBenchmarks() from console');
    window.runStorageBenchmarks = async () => {
        const results = await runBenchmarks();
        displayResults(results);
        console.log('\n\n📄 JSON Export:');
        console.log(exportResults(results));
        return results;
    };
    console.log('Call runStorageBenchmarks() to start');
}
export { runBenchmarks, displayResults, exportResults };
