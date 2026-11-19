import { runJNV1Benchmark } from './benchmark';

const results = runJNV1Benchmark('apex', 300);

console.log('\n=== JNV1.0-APEX Cognitive Engine Benchmark (300 rounds x 8 opponents) ===\n');
for (const r of results) {
  const wr = (r.decisiveWinRate * 100).toFixed(1).padStart(5);
  const edge = (r.netEdgePer100 >= 0 ? '+' : '') + r.netEdgePer100.toFixed(1);
  console.log(
    `${r.botId.padEnd(20)} | W:${String(r.jnvWins).padStart(3)} D:${String(r.draws).padStart(3)} L:${String(r.jnvLosses).padStart(3)} | Decisive WR: ${wr}% | Net/100: ${edge.padStart(6)} | SHA256:${r.allSealsVerified ? 'OK' : 'FAIL'} | ${r.botNameJp}`
  );
}
console.log('');
