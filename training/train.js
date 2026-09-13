// Re-fit the virality score weights from the thumbs-up/down you left in the app.
// Usage: npm run train
import { loadFeedback } from '../src/feedback.js';
import { trainWeights, saveModel, DEFAULT_WEIGHTS, FEATURES } from '../src/virality.js';

const samples = (await loadFeedback()).filter((f) => f.features);
const liked = samples.filter((s) => s.label === 1).length;
console.log(`${samples.length} rated clips (${liked} up, ${samples.length - liked} down)`);
if (samples.length < 6 || liked < 2 || samples.length - liked < 2) {
  console.log('Need at least 6 ratings with 2+ of each. Rate more clips in the app, then run this again.');
  process.exit(1);
}

const result = trainWeights(samples, DEFAULT_WEIGHTS);
await saveModel({ ...result, trainedAt: new Date().toISOString() });

const pct = (v) => (v === null ? 'n/a' : `${Math.round(v * 100)}%`);
console.log(`Ranking accuracy (AUC) on your ratings: ${pct(result.aucBefore)} -> ${pct(result.aucAfter)}`);
console.log('\nfeature          default  learned');
for (const f of FEATURES) {
  console.log(`${f.label.padEnd(16)} ${DEFAULT_WEIGHTS[f.key].toFixed(3).padStart(7)}  ${result.weights[f.key].toFixed(3).padStart(7)}`);
}
console.log('\nSaved to training/weights.json; new runs score with these weights.');
