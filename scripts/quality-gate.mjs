const providers = ['photon', 'geoapify', 'dadata'];

export function hasRussiaEvidence(value, expectedVersion) {
  if (!value || value.schemaVersion !== 2 || !Array.isArray(value.reports) || value.reports.length !== providers.length
    || typeof expectedVersion !== 'string' || !/^\d+\.\d+\.\d+$/u.test(expectedVersion)) return false;
  const revision = value.reports[0]?.sourceRevision;
  return typeof revision === 'string' && /^[a-f0-9]{40}$/u.test(revision)
    && providers.every((providerId) => value.reports.filter((report) => report?.providerId === providerId).length === 1)
    && value.reports.every((report) => report.status === 'passed' && report.measurement === 'live'
      && report.sourceVersion === expectedVersion && report.sourceRevision === revision
      && Number.isFinite(Date.parse(report.startedAt)) && Number.isFinite(Date.parse(report.checkedAt))
      && Date.parse(report.checkedAt) >= Date.parse(report.startedAt)
      && Number.isInteger(report.cases) && report.cases >= 100
      && Number.isInteger(report.uniqueCases) && report.uniqueCases === report.cases
      && Number.isInteger(report.regions) && report.regions >= 10 && report.regions <= report.uniqueCases
      && typeof report.largestRegionShare === 'number' && Number.isFinite(report.largestRegionShare)
      && report.largestRegionShare >= 1 / report.regions && report.largestRegionShare <= 0.2
      && report.wrongAutomatic === 0 && report.errors === 0 && report.skipped === 0 && report.attempted === report.cases
      && Number.isInteger(report.correctAutomatic) && Number.isInteger(report.unresolved) && report.unresolved >= 0
      && report.correctAutomatic + report.unresolved === report.cases
      && typeof report.confirmedRate === 'number' && Number.isFinite(report.confirmedRate)
      && report.confirmedRate === report.correctAutomatic / report.cases && report.confirmedRate >= 0.9 && report.confirmedRate <= 1
      && report.errorCounts !== null && typeof report.errorCounts === 'object' && !Array.isArray(report.errorCounts)
      && Object.keys(report.errorCounts).length === 0);
}
