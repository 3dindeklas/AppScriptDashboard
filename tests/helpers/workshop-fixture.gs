/** Fictieve brongegevens, uitsluitend geladen door Node-tests. */
function fixtureDashboardData_() {
  const records = fixtureRecords_();
  const names = records.reduce(function(sourceNames, record) {
    if (sourceNames.indexOf(record.source) === -1) sourceNames.push(record.source);
    return sourceNames;
  }, []);

  return {
    complete: true,
    records: records,
    sources: names.map(function(name) {
      const sourceRecords = records.filter(function(record) { return record.source === name; });
      return sourceResult_(
        name, 'ok', sourceRecords, emptyWarnings_(),
        'Fictieve gegevens voor veilig testen.', '', ''
      );
    })
  };
}

/** Fictieve interne records waarmee de tests berekeningen controleren. */
function fixtureRecords_() {
  return [
    ['fixture-a-1', 'Tech-hub A', '2026-09-03', 'Voorbeeldschool De Horizon', '3D-sleutelhanger', '3Dindeklas', 'Vijfheerenlanden', 'PO', 'groep 7/8', 'Uitgevoerd', 2, 24, 450, 600],
    ['fixture-a-2', 'Tech-hub A', '2026-09-10', 'Voorbeeldschool Het Kompas', 'Paper Circuits', '3Dindeklas', 'Molenlanden', 'PO', 'groep 5/6', 'Uitgevoerd', 1, 15, 300, 450],
    ['fixture-a-3', 'Tech-hub A', '2026-09-18', 'Voorbeeldschool De Brug', 'Codeer een robot met kleuren', '3Dindeklas', 'Gorinchem', 'PO', 'groep 3/4', 'Bevestiging', 2, 28, 500, 700],
    ['fixture-a-4', 'Tech-hub A', '2026-10-02', 'Voorbeeldcollege Noord', 'Micro:bit Magic', '3Dindeklas', 'Vijfheerenlanden', 'VO', 'leerjaar 1', 'Open', 4, 20, 800, 1000],
    ['fixture-a-5', 'Tech-hub A', '2026-10-12', 'Voorbeeldschool De Regenboog', 'Duurzaam huis met licht', 'MakerLab', 'Altena', 'PO', 'groep 6', 'Akkoord', 2, 18, 400, null],
    ['fixture-b-1', 'Tech-hub B', '2026-09-05', 'Voorbeeldschool De Uitvinder', 'Bouw een Spin Art-machine', '3Dindeklas', 'Sliedrecht', 'PO', 'groep 5/6', 'Uitgevoerd', 3, 27, 650, 850],
    ['fixture-b-2', 'Tech-hub B', '2026-09-16', 'Voorbeeldschool De Pionier', 'Programmeer een alarm', '3Dindeklas', 'Molenlanden', 'PO', 'groep 7/8', 'Uitgevoerd', 2, 22, 500, 650],
    ['fixture-b-3', 'Tech-hub B', '2026-09-25', 'Voorbeeldschool De Ruimte', '3D-sleutelhanger', '3Dindeklas', 'Nieuwegein', 'PO', 'groep 6', 'Ingepland', 2, 26, 450, 600],
    ['fixture-b-4', 'Tech-hub B', '2026-10-06', 'Voorbeeldcollege Zuid', 'Parachute-uitdaging', 'Techniekteam', 'IJsselstein', 'VO', 'leerjaar 2', 'Optie', 2, 30, null, 900],
    ['fixture-b-5', 'Tech-hub B', '2026-10-15', 'Voorbeeldschool Het Atelier', 'Greenscreen stop-motion', '3Dindeklas', 'Gorinchem', 'PO', 'groep 6/7', 'Bevestiging', 2, 24, 700, 950]
  ].map(function(row) {
    const scheduledDates = row[0] === 'fixture-a-4'
      ? []
      : row[0] === 'fixture-a-3' ? [row[2], '2026-10-02'] : [row[2]];
    const scheduledDate = scheduledDates[0] || null;
    const students = row[0] === 'fixture-b-4' ? null : row[11];
    return {
      requestId: row[0], source: row[1], requestedDate: row[2],
      scheduledDate: scheduledDate, scheduledDates: scheduledDates,
      schoolYear: schoolYear_(row[2]), school: row[3], schoolKey: schoolKey_(row[3], row[6]),
      workshop: row[4], provider: row[5], region: row[6], sector: row[7],
      gradeLabel: row[8], grades: gradeValues_(row[8], row[7]), status: row[9],
      statusGroup: statusGroup_(row[9]), sessions: row[10], students: students,
      desiredPeriod: '', location: '', type: 'Workshop', points: null,
      providerWorkshopPrice: null, travelCosts: null, extraCosts: null,
      providerTotalCosts: row[12], invoiceAmount: row[13], marginAmount: null,
      marginPercent: null, financialComplete: row[12] !== null && row[13] !== null,
      lastContactDate: null, actionRequired: ''
    };
  });
}
