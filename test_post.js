const payload = {
  productCode: 'N035SKB-OC-24FT',
  productionDate: new Date().toISOString(),
  samplingTime: new Date().toISOString(),
  machineId: 'L01',
  shift: 'Shift 1',
  batchNumber: 'K-L01-26214-A',
  size: 'M',
  sampleSize: 125,
  dimensions: {},
  dimensionMins: {},
  defects: {},
  verdict: 'PASSED',
  aadObjectId: 'mock-user-id',
  userPrincipalName: 'operator@oneglove.com',
  amendmentStatus: 'UNMODIFIED',
  totalCarton: 18,
  gloveWeight: 3.5,
  amendmentLogs: [],
  profileId: 'prof_default',
};

fetch('http://localhost:4009/api/submissions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
  .then(async res => {
    console.log(res.status, res.statusText);
    console.log(await res.text());
  })
  .catch(console.error);
