export function hasRussiaEvidence(value) {
  return value !== null && typeof value === 'object' && value.status === 'passed'
    && Number.isInteger(value.cases) && value.cases >= 100
    && value.wrongAutomatic === 0 && value.errors === 0
    && typeof value.confirmedRate === 'number' && Number.isFinite(value.confirmedRate)
    && value.confirmedRate >= 0.9 && value.confirmedRate <= 1;
}
