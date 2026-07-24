// Quick Node.js test script using the built-in fetch API (Node 18+)
// Tests the /api/submissions/evaluate endpoint

const BASE = 'http://localhost:4009';

async function test(name, payload, expectedVerdict) {
  const res = await fetch(`${BASE}/api/submissions/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  const pass = data.verdict === expectedVerdict;
  console.log(`\n[${pass ? '✅ PASS' : '❌ FAIL'}] ${name}`);
  console.log(`  Verdict: ${data.verdict} (expected ${expectedVerdict})`);
  if (data.categoryResults) {
    data.categoryResults.forEach(cr => {
      console.log(`  Category: ${cr.categoryName} | mode=${cr.evaluationMode} | total=${cr.totalCount} | ac=${cr.threshold.ac} | passed=${cr.passed}`);
    });
  }
  if (data.error) {
    console.log(`  Error: ${data.error}`);
  }
  return pass;
}

const CATEGORIES = [
  { id: 'cat-1', name: 'Barrier Defects', aqlLevel: 'AND (Zero Tolerance)', evaluationMode: 'GRANULAR' },
  { id: 'cat-2', name: 'Major Visual',    aqlLevel: '2.5',                   evaluationMode: 'CUMULATIVE' },
];

const DEFS = [
  { id: 'def-1', name: 'Pinhole At Crotch', currentClass: 'cat-1' },
  { id: 'def-2', name: 'Colour Streak',     currentClass: 'cat-2' },
  { id: 'def-3', name: 'Surface Mark',      currentClass: 'cat-2' },
];

(async () => {
  // Health check first
  const hc = await fetch(`${BASE}/api/health`);
  const hcData = await hc.json();
  console.log('Health:', hcData);

  await test(
    'PASS — Barrier=0, Major Visual cumulative=5 (Ac=7 for n=125, AQL=2.5)',
    { sampleSize: 125, categories: CATEGORIES, defectDefinitions: DEFS, defects: { 'def-1': 0, 'def-2': 3, 'def-3': 2 } },
    'PASSED'
  );

  await test(
    'FAIL — Barrier=1 (zero tolerance triggered)',
    { sampleSize: 125, categories: CATEGORIES, defectDefinitions: DEFS, defects: { 'def-1': 1, 'def-2': 3, 'def-3': 2 } },
    'FAILED'
  );

  await test(
    'FAIL — Barrier=0, Major Visual cumulative=10 > Ac=7',
    { sampleSize: 125, categories: CATEGORIES, defectDefinitions: DEFS, defects: { 'def-1': 0, 'def-2': 6, 'def-3': 4 } },
    'FAILED'
  );

  await test(
    'PASS — n=32, Major Visual cumulative=2 (Ac=2 for n=32, AQL=2.5)',
    { sampleSize: 32, categories: CATEGORIES, defectDefinitions: DEFS, defects: { 'def-1': 0, 'def-2': 1, 'def-3': 1 } },
    'PASSED'
  );

  // Test GET /api/submissions (empty DB list)
  const listRes = await fetch(`${BASE}/api/submissions`);
  const listData = await listRes.json();
  console.log(`\n[✅] GET /api/submissions → count=${listData.count}`);

  console.log('\n=== All tests complete ===');
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
