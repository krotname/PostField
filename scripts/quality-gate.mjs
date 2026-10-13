export function hasRussiaEvidence(value) {
  return value !== null && typeof value === 'object' && value.status === 'passed'
    && Number.isInteger(value.cases) && value.cases >= 100
    && Number.isInteger(value.uniqueCases) && value.uniqueCases === value.cases
    && Number.isInteger(value.regions) && value.regions >= 10 && value.regions <= value.uniqueCases
    && typeof value.largestRegionShare === 'number' && Number.isFinite(value.largestRegionShare)
    && value.largestRegionShare >= 1 / value.regions && value.largestRegionShare <= 0.2
    && value.wrongAutomatic === 0 && value.errors === 0
    && typeof value.confirmedRate === 'number' && Number.isFinite(value.confirmedRate)
    && value.confirmedRate >= 0.9 && value.confirmedRate <= 1;
}
